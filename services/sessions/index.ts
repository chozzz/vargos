import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { glob } from 'tinyglobby';
import { on, register } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap, SessionCreateParams, SessionAddMessageParams, Session, Message } from '../../gateway/events.js';
import { createLogger, emitError } from '../../lib/logger.js';
import { getDataPaths, resolveSessionDir, sessionKeyToDir } from '../../lib/paths.js';
import { paginate } from '../../lib/paginate.js';

export type { Session, Message, MessageRole } from '../../gateway/events.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export class SessionsService {
  private readonly log = createLogger('sessions');

  // ── Bus handlers ──────────────────────────────────────────────────────────

  @register('session.create', {
    description: 'Create a new session or retrieve existing one.',
    schema: z.object({
      sessionKey: z.string().describe('Unique session identifier'),
      model: z.string().optional().describe('Model override for this session'),
      metadata: z.record(z.any()).optional().describe('Session metadata'),
      notify: z.array(z.string()).optional().describe('Notification targets'),
    }),
  })
  async create(params: SessionCreateParams): Promise<void> {
    const existing = await this.load(params.sessionKey).catch(() => null);
    if (existing) return; // already exists — idempotent

    const now = new Date();
    const session: Session = {
      sessionKey: params.sessionKey,
      kind:       this.inferKind(params.sessionKey),
      createdAt:  now,
      updatedAt:  now,
      metadata:   (params.metadata ?? {}) as Record<string, unknown>,
      ...(params.notify ? { notify: params.notify } : {}),
    };

    await this.saveSession(session, []);
    this.log.debug(`created: ${params.sessionKey}`);
  }

  @register('session.get', {
    description: 'Retrieve a session by key.',
    schema: z.object({
      sessionKey: z.string().describe('Session identifier'),
    }),
  })
  async get(params: EventMap['session.get']['params']): Promise<EventMap['session.get']['result']> {
    const data = await this.load(params.sessionKey);
    if (!data) throw new Error(`Session not found: ${params.sessionKey}`);
    return data.session;
  }

  @register('session.addMessage', {
    description: 'Add a message to a session.',
    schema: z.object({
      sessionKey: z.string().describe('Session identifier'),
      role: z.enum(['user', 'assistant', 'system']).describe('Message role'),
      content: z.string().describe('Message content'),
      metadata: z.record(z.any()).optional().describe('Message metadata'),
    }),
  })
  async addMessage(params: SessionAddMessageParams): Promise<void> {
    // Auto-create session if it doesn't exist
    const exists = await this.load(params.sessionKey).catch(() => null);
    if (!exists) await this.create({ sessionKey: params.sessionKey });

    const message: Message = {
      id:         `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      sessionKey: params.sessionKey,
      role:       params.role,
      content:    params.content,
      timestamp:  new Date(),
      ...(params.metadata ? { metadata: params.metadata as Record<string, unknown> } : {}),
    };

    const filePath = this.filePath(params.sessionKey);
    await fs.appendFile(filePath, JSON.stringify(message) + '\n', 'utf-8');
  }

  @register('session.getMessages', {
    description: 'Retrieve messages from a session.',
    schema: z.object({
      sessionKey: z.string().describe('Session identifier'),
      limit: z.number().int().optional().describe('Maximum number of messages to return'),
    }),
  })
  async getMessages(params: EventMap['session.getMessages']['params']): Promise<EventMap['session.getMessages']['result']> {
    const data = await this.load(params.sessionKey).catch(() => null);
    if (!data) return [];
    const msgs = params.limit ? data.messages.slice(-params.limit) : data.messages;
    return msgs;
  }

  @register('session.search', {
    description: 'Search sessions by key prefix or list all.',
    schema: z.object({
      query: z.string().optional(),
      page:  z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).optional(),
    }),
  })
  async search(params: EventMap['session.search']['params']): Promise<EventMap['session.search']['result']> {
    const all = (await this.listAll()).map(r => r.session);
    const q   = params.query?.toLowerCase();
    const filtered = q ? all.filter(s => s.sessionKey.toLowerCase().includes(q)) : all;
    filtered.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return paginate(filtered, params.page, params.limit);
  }

  @register('session.delete', {
    description: 'Delete a session and all its messages.',
    schema: z.object({
      sessionKey: z.string().describe('Session identifier'),
    }),
  })
  async delete(params: EventMap['session.delete']['params']): Promise<void> {
    const dir = path.dirname(this.filePath(params.sessionKey));
    await fs.rm(dir, { recursive: true, force: true });
    this.log.info(`deleted: ${params.sessionKey}`);
  }

  @register('session.compact', {
    description: 'Compact a session by removing older messages.',
    schema: z.object({
      sessionKey: z.string().describe('Session identifier'),
      count: z.number().int().describe('Number of most recent messages to keep'),
    }),
  })
  async compact(params: EventMap['session.compact']['params']): Promise<void> {
    const filePath = this.filePath(params.sessionKey);
    let content: string;
    try { content = await fs.readFile(filePath, 'utf-8'); } catch { return; }

    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length <= 1) return;

    const toRemove = Math.min(params.count, lines.length - 1);
    const kept = [lines[0], ...lines.slice(1 + toRemove)];
    await fs.writeFile(filePath, kept.join('\n') + '\n');
    this.log.debug(`compacted ${toRemove} messages from ${params.sessionKey}`);
  }

  // ── File store ────────────────────────────────────────────────────────────

  private filePath(sessionKey: string): string {
    const dir = resolveSessionDir(sessionKey);
    return path.join(dir, `${sessionKeyToDir(path.basename(dir))}.jsonl`);
  }

  private async load(sessionKey: string): Promise<{ session: Session; messages: Message[] } | null> {
    let content: string;
    try { content = await fs.readFile(this.filePath(sessionKey), 'utf-8'); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }

    const lines = content.trim().split('\n').filter(Boolean);
    if (!lines.length) return null;

    const raw = JSON.parse(lines[0]) as Session;
    if (!raw.sessionKey) return null;

    const session: Session = {
      ...raw,
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
    };

    const messages: Message[] = [];
    for (const line of lines.slice(1)) {
      try {
        const m = JSON.parse(line) as Message;
        if (!m.role) continue;
        messages.push({ ...m, timestamp: new Date(m.timestamp) });
      } catch { /* skip malformed */ }
    }

    return { session, messages };
  }

  private async saveSession(session: Session, messages: Message[]): Promise<void> {
    const filePath = this.filePath(session.sessionKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const lines = [JSON.stringify(session), ...messages.map(m => JSON.stringify(m))];
    await fs.writeFile(filePath, lines.join('\n') + '\n');
  }

  private async listAll(): Promise<Array<{ session: Session; dir: string }>> {
    const { sessionsDir } = getDataPaths();
    const files = await glob(['*/*.jsonl', '*/subagents/*/*.jsonl'], { cwd: sessionsDir, absolute: true }).catch(() => []);
    const results: Array<{ session: Session; dir: string }> = [];

    for (const file of files) {
      try {
        const first = (await fs.readFile(file, 'utf-8')).split('\n')[0];
        if (!first) continue;
        const raw = JSON.parse(first) as Session;
        if (!raw.sessionKey) continue;
        const session = { ...raw, createdAt: new Date(raw.createdAt), updatedAt: new Date(raw.updatedAt) };
        results.push({ session, dir: path.dirname(file) });
      } catch { /* skip */ }
    }

    return results;
  }

  private inferKind(sessionKey: string): Session['kind'] {
    if (sessionKey.includes(':subagent:')) return 'subagent';
    if (sessionKey.startsWith('cron:'))    return 'cron';
    return 'main';
  }

  // ── Reaper ────────────────────────────────────────────────────────────────

  async reap(): Promise<void> {
    const now         = Date.now();
    const cronTtl     = 7 * DAY_MS;
    const subagentTtl = 3 * DAY_MS;

    const all    = await this.listAll();
    let pruned   = 0;

    for (const { session, dir } of all) {
      const age = now - session.updatedAt.getTime();
      const expired =
        (session.kind === 'cron'     && age > cronTtl) ||
        (session.kind === 'subagent' && age > subagentTtl);
      if (!expired) continue;

      await fs.rm(dir, { recursive: true, force: true });
      this.log.info(`deleted: ${session.sessionKey}`);
      pruned++;
    }

    if (pruned) this.log.info(`reaper: pruned ${pruned} session(s)`);
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop(): Promise<void> }> {
  const { sessionsDir } = getDataPaths();
  await fs.mkdir(sessionsDir, { recursive: true });

  const svc = new SessionsService();
  bus.bootstrap(svc);

  // Reap on boot + every 6 hours
  svc.reap().catch(err => emitError('sessions', err));
  const interval = setInterval(() => svc.reap().catch(err => emitError('sessions', err)), 6 * 60 * 60 * 1000);

  return { stop: async () => clearInterval(interval) };
}
