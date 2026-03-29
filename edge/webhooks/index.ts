/**
 * Webhooks edge service — inbound HTTP webhooks that trigger agent runs.
 *
 * Callable: webhook.search
 * Subscribes: agent.onCompleted (delivery to notify targets)
 *
 * Inbound flow: POST /hooks/:id → validate token → transform payload
 *   → session create/addMessage → agent.execute → deliver to notify targets
 */

import http from 'node:http';
import { timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import { on } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import type { AppConfig, WebhookEntry } from '../../services/config/index.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { getDataPaths } from '../../lib/paths.js';
import { webhookSessionKey, parseSessionKey } from '../../lib/subagent.js';
import { paginate } from '../../lib/paginate.js';
import { passthroughTransform, loadTransform } from './transform.js';

const log = createLogger('webhooks');

const MAX_BODY   = 1024 * 1024; // 1 MB
const HOOK_ID_RE = /^[a-z0-9_-]+$/i;
const HTTP_PORT  = 9002;
const HTTP_HOST  = '127.0.0.1';

// ── WebhooksEdge ──────────────────────────────────────────────────────────────

export class WebhooksEdge {
  private hooks: Map<string, WebhookEntry>;
  private activeHooks = new Set<string>();
  private server: http.Server | null = null;
  private unsubscribeCompleted?: () => void;

  constructor(
    private readonly bus: Bus,
    private readonly config: AppConfig,
  ) {
    this.hooks = new Map(config.webhooks.map(h => [h.id, h]));
  }

  async start(): Promise<void> {
    this.unsubscribeCompleted = this.bus.on(
      'agent.onCompleted',
      (payload) => this.onAgentCompleted(payload),
    );

    await this.startHttp();
    this.bus.registerService(this);
    log.info(`started with ${this.hooks.size} webhook(s) on ${HTTP_HOST}:${HTTP_PORT}`);
  }

  async stop(): Promise<void> {
    this.unsubscribeCompleted?.();
    await this.stopHttp();
  }

  // ── Callable handler ─────────────────────────────────────────────────────

  @on('webhook.search', {
    description: 'List registered webhook endpoints.',
    schema: z.object({
      query: z.string().optional(),
      page:  z.number(),
      limit: z.number().optional(),
    }),
    format: (r) => {
      const res = r as EventMap['webhook.search']['result'];
      return res.items.map(h => `${h.id}: ${h.name}`).join('\n') || 'No webhooks.';
    },
  })
  async search(params: EventMap['webhook.search']['params']): Promise<EventMap['webhook.search']['result']> {
    // Strip tokens — never expose secrets
    const all: WebhookEntry[] = Array.from(this.hooks.values()).map(
      ({ id, name, transform, notify }) => ({ id, name, token: '', transform, notify }),
    );
    const filtered = params.query
      ? all.filter(h => h.id.includes(params.query!) || h.name.includes(params.query!))
      : all;
    return paginate(filtered, params.page, params.limit ?? 20);
  }

  // ── Agent completed handler ───────────────────────────────────────────────

  private onAgentCompleted(payload: EventMap['agent.onCompleted']): void {
    const parsed = parseSessionKey(payload.sessionKey);
    if (parsed.type !== 'webhook') return;
    // webhookSessionKey format: "webhook:<hookId>:<timestamp>"
    const hookId = parsed.id.replace(/:\d+$/, '');
    this.activeHooks.delete(hookId);
  }

  // ── HTTP server ───────────────────────────────────────────────────────────

  private startHttp(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.headersTimeout = 10_000;
      this.server.requestTimeout = 30_000;
      this.server.on('error', reject);
      this.server.listen(HTTP_PORT, HTTP_HOST, () => {
        log.info(`http listening on ${HTTP_HOST}:${HTTP_PORT}`);
        resolve();
      });
    });
  }

  private stopHttp(): Promise<void> {
    const srv = this.server;
    if (!srv) return Promise.resolve();
    this.server = null;
    return new Promise(resolve => srv.close(() => resolve()));
  }

  // ── Request handling ──────────────────────────────────────────────────────

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method !== 'POST' || !req.url?.startsWith('/hooks/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const hookId = req.url.slice('/hooks/'.length).split('?')[0];
    if (!HOOK_ID_RE.test(hookId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid hook ID' }));
      return;
    }

    const hook = this.hooks.get(hookId);
    if (!hook) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unknown hook' }));
      return;
    }

    // Timing-safe comparison (hash prevents length leakage)
    const auth         = req.headers.authorization ?? '';
    const expectedHash = createHash('sha256').update(`Bearer ${hook.token}`).digest();
    const authHash     = createHash('sha256').update(auth).digest();
    if (!timingSafeEqual(authHash, expectedHash)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const chunks: Buffer[] = [];
    let size      = 0;
    let destroyed = false;

    req.on('error', () => {
      if (!res.writableEnded) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request error' }));
      }
    });

    req.on('data', (chunk: Buffer) => {
      if (destroyed) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        destroyed = true;
        req.destroy();
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (res.writableEnded) return;
      // Respond immediately — fire and forget
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));

      let payload: unknown;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        payload = {};
      }

      this.fireHook(hook, payload).catch(err =>
        log.error(`fire hook ${hookId}: ${toMessage(err)}`),
      );
    });
  }

  // ── Fire ──────────────────────────────────────────────────────────────────

  private async fireHook(hook: WebhookEntry, payload: unknown): Promise<void> {
    const { dataDir } = getDataPaths();

    const task = hook.transform
      ? await loadTransform(hook.transform, dataDir).then(fn => fn(payload))
      : passthroughTransform(payload);

    const sessionKey = webhookSessionKey(hook.id);

    await this.bus.call('session.create', {
      sessionKey,
      metadata: {
        hookId: hook.id,
        ...(hook.notify?.length && { notify: hook.notify }),
      },
    }).catch(err => log.error(`session create: ${toMessage(err)}`));

    await this.bus.call('session.addMessage', {
      sessionKey,
      content: task,
      role: 'user',
      metadata: { source: 'webhook', hookId: hook.id },
    }).catch(err => log.error(`addMessage: ${toMessage(err)}`));

    log.info(`fired: ${hook.id} → ${sessionKey}`);
    this.activeHooks.add(hook.id);

    const result = await this.bus.call('agent.execute', { sessionKey, task });

    if (!result.response || !hook.notify?.length) return;

    // If subagents are running, AgentService's routeParentResult handles delivery.
    const { activeRuns } = await this.bus.call('agent.status', {});
    const prefix = sessionKey + ':subagent:';
    if (activeRuns.some(r => r.startsWith(prefix))) {
      log.info(`${hook.id} spawned subagents — delivery deferred`);
      return;
    }

    await this.deliver(hook.notify, result.response);
  }

  private async deliver(targets: string[], text: string): Promise<void> {
    for (const target of targets) {
      await this.bus.call('session.addMessage', {
        sessionKey: target, content: text, role: 'assistant',
      }).catch(err => log.error(`notify store to ${target}: ${toMessage(err)}`));

      await this.bus.call('channel.send', {
        sessionKey: target, text,
      }).catch(err => log.error(`notify send to ${target}: ${toMessage(err)}`));
    }
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop(): Promise<void> }> {
  const config = await bus.call('config.get', {});
  const svc = new WebhooksEdge(bus, config);
  await svc.start();
  return { stop: () => svc.stop() };
}
