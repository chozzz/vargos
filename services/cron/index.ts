/**
 * Cron service — schedules and fires periodic tasks.
 *
 * Callable: cron.search, cron.add, cron.remove, cron.update, cron.run
 *
 * Concurrency: one active run per task (via activeTasks set).
 * Lock released on agent.onCompleted for cron sessions.
 *
 * Delivery: after each run, sends result to task's notify targets.
 * Heartbeat OK responses (HEARTBEAT_OK) are pruned silently.
 * Subagent deferral: if subagents are still running, the agent runtime may
 * defer delivery until the parent run completes.
 */

import { CronJob } from 'cron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { register } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import type { AppConfig, CronTask, CronAddParams, CronUpdateParams } from '../../services/config/index.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { getDataPaths } from '../../lib/paths.js';
import { generateId } from '../../lib/id.js';
import { cronSessionKey, parseSessionKey } from '../../lib/subagent.js';
import {
  isWithinActiveHours,
  isHeartbeatContentEffectivelyEmpty,
  stripHeartbeatToken,
} from '../../lib/heartbeat.js';

const log = createLogger('cron');

// ── CronService ───────────────────────────────────────────────────────────────

export class CronService {
  private jobs = new Map<string, { task: CronTask; job: CronJob }>();
  private ephemeralIds = new Set<string>();
  private activeTasks = new Set<string>();
  private beforeFireHooks = new Map<string, () => Promise<boolean>>();
  private unsubscribeCompleted?: () => void;
  private readonly cronDir: string;

  constructor(
    private readonly bus: Bus,
    private readonly config: AppConfig,
    cronDir?: string,
  ) {
    this.cronDir = cronDir ?? getDataPaths().cronDir;
  }

  async start(): Promise<void> {
    // Load tasks from disk
    const diskTasks = await this.loadTasksFromDisk();
    for (const task of diskTasks) {
      this.addJob(task);
    }

    // Register heartbeat if task exists (loaded from disk)
    if (this.jobs.has('heartbeat')) {
      this.registerHeartbeat();
    }

    this.startAll();

    this.unsubscribeCompleted = this.bus.on(
      'agent.onCompleted',
      (payload) => this.onAgentCompleted(payload),
    );
  }

  stop(): void {
    this.stopAll();
    this.unsubscribeCompleted?.();
  }

  // ── Callable handlers ─────────────────────────────────────────────────────

  @register('cron.search', {
    description: 'Search scheduled cron tasks.',
    schema: z.object({ query: z.string().optional(), page: z.number(), limit: z.number().optional() }),
  })
  async search(params: EventMap['cron.search']['params']): Promise<EventMap['cron.search']['result']> {
    const { query, page, limit = 20 } = params;
    const all = Array.from(this.jobs.values())
      .filter(e => !this.ephemeralIds.has(e.task.id))
      .map(e => e.task);
    const filtered = query
      ? all.filter(t => t.name.includes(query) || t.id.includes(query) || t.task.includes(query))
      : all;
    const offset = (page - 1) * limit;
    return { items: filtered.slice(offset, offset + limit), page, limit };
  }

  @register('cron.add', {
    description: 'Add a new scheduled cron task.',
    schema: z.object({
      name: z.string(),
      schedule: z.string(),
      task: z.string(),
      notify: z.array(z.string()).optional(),
    }),
  })
  async add(params: CronAddParams): Promise<void> {
    const id = generateId('cron');
    if (this.jobs.has(id)) {
      throw new Error(`Cron task already exists: ${id}`);
    }

    const task: CronTask = { ...params, id, enabled: true };

    // Write to disk
    await this.writeTaskToDisk(task);

    // Register in-memory
    this.addJob(task);
    this.jobs.get(task.id)!.job.start();
    log.info(`task added: ${task.name} (${task.id})`);
  }

  @register('cron.remove', {
    description: 'Remove a scheduled cron task.',
    schema: z.object({ id: z.string() }),
  })
  async remove(params: EventMap['cron.remove']['params']): Promise<void> {
    const entry = this.jobs.get(params.id);
    if (!entry) return;

    const isEphemeral = this.ephemeralIds.has(params.id);

    entry.job.stop();
    this.jobs.delete(params.id);
    this.ephemeralIds.delete(params.id);
    this.activeTasks.delete(params.id);

    // Delete from disk (only persistent tasks)
    if (!isEphemeral) {
      await this.deleteTaskFromDisk(params.id);
    }

    log.info(`task removed: ${params.id}`);
  }

  @register('cron.update', {
    description: 'Update a scheduled cron task.',
    schema: z.object({
      id: z.string(),
      name: z.string().optional(),
      schedule: z.string().optional(),
      task: z.string().optional(),
      enabled: z.boolean().optional(),
      notify: z.array(z.string()).optional(),
    }),
  })
  async update(params: CronUpdateParams): Promise<void> {
    const entry = this.jobs.get(params.id);
    if (!entry) throw new Error(`No task with id: ${params.id}`);

    const updates = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined)
    );
    const updated: CronTask = { ...entry.task, ...updates };

    if (params.schedule && params.schedule !== entry.task.schedule) {
      entry.job.stop();
      const job = new CronJob(
        updated.schedule,
        () => this.fire(params.id),
        null,
        updated.enabled,
        'UTC',
      );
      this.jobs.set(params.id, { task: updated, job });
    } else {
      entry.task = updated;
      if (params.enabled === false) entry.job.stop();
      else if (params.enabled === true) entry.job.start();
    }

    // Write to disk (only persistent tasks)
    const isEphemeral = this.ephemeralIds.has(params.id);
    if (!isEphemeral) {
      await this.writeTaskToDisk(updated);
    }

    log.info(`task updated: ${params.id}`);
  }

  @register('cron.run', {
    description: 'Manually trigger a cron task immediately.',
    schema: z.object({ id: z.string() }),
  })
  async run(params: EventMap['cron.run']['params']): Promise<void> {
    const entry = this.jobs.get(params.id);
    if (!entry) throw new Error(`No task with id: ${params.id}`);
    // Fire without awaiting — long-running tasks must not block the RPC socket
    this.executeTask(entry.task).catch(err =>
      log.error(`manual run failed: ${params.id}: ${toMessage(err)}`),
    );
  }

  // ── Internal scheduling ───────────────────────────────────────────────────

  private addJob(task: CronTask, opts?: { ephemeral?: boolean }): void {
    const job = new CronJob(task.schedule, () => this.fire(task.id), null, false, 'UTC');
    this.jobs.set(task.id, { task, job });
    if (opts?.ephemeral) this.ephemeralIds.add(task.id);
  }

  private startAll(): void {
    let count = 0;
    for (const { task, job } of this.jobs.values()) {
      if (task.enabled) {
        log.debug(`starting job: ${task.id} (${task.schedule})`);
        job.start();
        count++;
      } else {
        log.debug(`skipping disabled job: ${task.id}`);
      }
    }
    log.info(`${count} jobs started`);
  }

  private stopAll(): void {
    for (const { job } of this.jobs.values()) job.stop();
  }

  private fire(id: string): void {
    if (this.activeTasks.has(id)) {
      log.info(`skipping fire — task still active: ${id}`);
      return;
    }
    const entry = this.jobs.get(id);
    if (!entry) {
      log.warn(`fire() called for unknown task: ${id}`);
      return;
    }
    if (!entry.task.enabled) {
      log.debug(`task disabled, not firing: ${id}`);
      return;
    }

    const hook = this.beforeFireHooks.get(id);
    const check = hook ? hook() : Promise.resolve(true);

    check.then(async (shouldFire) => {
      if (!shouldFire) {
        log.debug(`hook check returned false for ${id}, not firing`);
        return;
      }
      this.activeTasks.add(id);
      try {
        await this.executeTask(entry.task);
      } catch (err) {
        log.error('task execution error', { id, error: err instanceof Error ? err.message : String(err) });
      }
    }).catch(err => log.error(`hook check error: ${id}: ${err}`));
  }

  private onAgentCompleted(payload: EventMap['agent.onCompleted']): void {
    const parsed = parseSessionKey(payload.sessionKey);
    if (parsed.type !== 'cron') return;
    // Strip date suffix to recover taskId (e.g. "daily-backup:2026-03-29" → "daily-backup")
    const taskId = parsed.id.replace(/:\d{4}-\d{2}-\d{2}$/, '');
    if (this.activeTasks.delete(taskId)) {
      log.debug(`concurrency lock released: ${taskId}`);
    }
  }

  // ── Task execution ────────────────────────────────────────────────────────

  private async executeTask(task: CronTask): Promise<void> {
    const sessionKey = cronSessionKey(task.id);
    log.info(`task firing: ${task.name} (${task.id}) → ${sessionKey}`);

    const result = await this.bus.call('agent.execute', {
      sessionKey,
      task: task.task,
    });

    if (!result.response) return;

    const cleaned = stripHeartbeatToken(result.response);
    if (cleaned === null) {
      log.debug(`heartbeat no-op: ${task.id}`);
      return;
    }

    if (!task.notify?.length) return;

    await this.deliver(task.notify, cleaned);
  }

  private async deliver(targets: string[], text: string): Promise<void> {
    for (const target of targets) {
      await this.bus.call('channel.send', {
        sessionKey: target, text,
      }).catch(err => log.error(`notify send to ${target}: ${toMessage(err)}`));
    }
  }

  // ── File I/O ──────────────────────────────────────────────────────────────

  private parseFrontmatterValue(value: string): unknown {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value.replace(/^["']|["']$/g, '');
  }

  private parseMarkdownTask(content: string): { frontmatter: Record<string, unknown>; body: string } | null {
    if (!content || typeof content !== 'string') {
      return null;
    }

    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;

    const frontmatterStr = match[1]?.trim();
    const body = match[2]?.trim() ?? '';

    if (!frontmatterStr) {
      return null; // Empty frontmatter
    }

    const frontmatter: Record<string, unknown> = {};
    for (const line of frontmatterStr.split('\n')) {
      if (!line.trim()) continue;

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();

      if (!key) continue;

      frontmatter[key] = this.parseFrontmatterValue(value);
    }

    return { frontmatter, body };
  }

  private serializeMarkdownTask(task: CronTask): string {
    const { task: taskPrompt, ...metadata } = task;
    const frontmatter = Object.entries(metadata)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}:\n${value.map(v => `  - ${v}`).join('\n')}`;
        }
        return `${key}: ${typeof value === 'string' ? `"${value}"` : value}`;
      })
      .join('\n');

    return `---\n${frontmatter}\n---\n\n${taskPrompt}\n`;
  }

  private async loadTasksFromDisk(): Promise<CronTask[]> {
    const tasks: CronTask[] = [];

    try {
      const files = await fs.readdir(this.cronDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      if (mdFiles.length === 0) {
        log.debug(`no tasks found in ${this.cronDir}`);
        return tasks;
      }

      for (const filename of mdFiles) {
        try {
          const filepath = path.join(this.cronDir, filename);
          const content = await fs.readFile(filepath, 'utf-8');

          const parsed = this.parseMarkdownTask(content);
          if (!parsed) {
            log.warn(`${filename}: missing or invalid YAML frontmatter (expected --- ... ---)}`);
            continue;
          }

          // Validate required fields
          const { id, schedule } = parsed.frontmatter;
          if (!id || !schedule) {
            log.warn(`${filename}: missing required fields (id: ${id ? '✓' : '✗'}, schedule: ${schedule ? '✓' : '✗'})`);
            continue;
          }

          const task: CronTask = {
            id: String(id),
            name: String(parsed.frontmatter.title || parsed.frontmatter.name || id),
            schedule: String(schedule),
            task: parsed.body || '',
            enabled: parsed.frontmatter.enabled === true,
            notify: Array.isArray(parsed.frontmatter.notify) ? parsed.frontmatter.notify.map(String) : undefined,
            activeHours: Array.isArray(parsed.frontmatter.activeHours) ? parsed.frontmatter.activeHours.map(Number) : undefined,
            activeHoursTimezone: parsed.frontmatter.activeHoursTimezone ? String(parsed.frontmatter.activeHoursTimezone) : undefined,
          };

          tasks.push(task);
          log.debug(`loaded task: ${task.id}`);

          // Mark heartbeat as ephemeral
          if (task.id === 'heartbeat') {
            this.ephemeralIds.add(task.id);
          }
        } catch (err) {
          log.warn(`${filename}: ${toMessage(err)}`);
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        log.debug(`cron directory does not exist yet: ${this.cronDir}`);
      } else {
        log.warn(`failed to read cron directory: ${toMessage(err)}`);
      }
    }

    return tasks;
  }

  private async writeTaskToDisk(task: CronTask): Promise<void> {
    if (!task?.id) {
      throw new Error('Cannot write task without id');
    }

    try {
      await fs.mkdir(this.cronDir, { recursive: true });

      const filepath = path.join(this.cronDir, `${task.id}.md`);
      const tmpPath = `${filepath}.tmp`;

      try {
        const content = this.serializeMarkdownTask(task);
        if (!content) {
          throw new Error('Failed to serialize task');
        }
        await fs.writeFile(tmpPath, content, 'utf-8');
        await fs.rename(tmpPath, filepath);
        log.debug(`wrote task to disk: ${task.id}`);
      } catch (err) {
        try {
          await fs.unlink(tmpPath);
        } catch {
          // Ignore cleanup errors
        }
        throw err;
      }
    } catch (err) {
      log.error(`failed to write task ${task.id}: ${toMessage(err)}`);
      throw err;
    }
  }

  private async deleteTaskFromDisk(taskId: string): Promise<void> {
    const filepath = path.join(this.cronDir, `${taskId}.md`);
    try {
      await fs.unlink(filepath);
    } catch (err) {
      if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) {
        throw err;
      }
      // File doesn't exist, that's fine
    }
  }

  // ── Heartbeat ─────────────────────────────────────────────────────────────

  private registerHeartbeat(): void {
    const entry = this.jobs.get('heartbeat');
    if (!entry) {
      log.warn('heartbeat task not found in cron tasks');
      return;
    }

    const { workspaceDir } = getDataPaths();
    const activeHours = entry.task.activeHours as [number, number] | undefined;
    const activeHoursTimezone = entry.task.activeHoursTimezone;

    this.beforeFireHooks.set('heartbeat', async () => {
      if (!isWithinActiveHours(activeHours, activeHoursTimezone)) return false;

      const { activeRuns } = await this.bus.call('agent.status', {});
      if (activeRuns.length > 0) return false;

      try {
        const content = await fs.readFile(path.join(workspaceDir, 'HEARTBEAT.md'), 'utf-8');
        if (isHeartbeatContentEffectivelyEmpty(content)) return false;
      } catch {
        return false; // missing file
      }

      return true;
    });

    log.info('heartbeat registered');
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop(): void }> {
  const config = await bus.call('config.get', {});
  const svc = new CronService(bus, config);
  await svc.start();
  bus.bootstrap(svc);
  log.info('cron service started');
  return { stop: () => svc.stop() };
}
