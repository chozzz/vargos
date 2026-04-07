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
import type { HeartbeatConfig } from '../../services/config/schemas.js';
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

const DEFAULT_HEARTBEAT_PROMPT = [
  'Heartbeat poll. Read HEARTBEAT.md for your checklist.',
  'Follow it strictly — do not infer tasks from previous sessions.',
  'If nothing needs attention, reply with exactly: HEARTBEAT_OK',
].join(' ');

// ── CronService ───────────────────────────────────────────────────────────────

export class CronService {
  private jobs = new Map<string, { task: CronTask; job: CronJob }>();
  private ephemeralIds = new Set<string>();
  private activeTasks = new Set<string>();
  private beforeFireHooks = new Map<string, () => Promise<boolean>>();
  private unsubscribeCompleted?: () => void;

  constructor(
    private readonly bus: Bus,
    private readonly config: AppConfig,
  ) {}

  start(): void {
    for (const task of this.config.cron.tasks) {
      this.addJob(task);
    }

    if (this.config.heartbeat.enabled !== false) {
      this.registerHeartbeat(this.config.heartbeat);
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
    const all = this.listPersistable();
    const filtered = query
      ? all.filter(t => t.name.includes(query) || t.id.includes(query) || t.task.includes(query))
      : all;
    const offset = (page - 1) * limit;
    return { items: filtered.slice(offset, offset + limit), page, limit };
  }

  @register('cron.add', {
    description: 'Add a new scheduled cron task.',
    schema: z.object({
      name:     z.string(),
      schedule: z.string(),
      task:     z.string(),
      notify:   z.array(z.string()).optional(),
    }),
  })
  async add(params: CronAddParams): Promise<void> {
    const task: CronTask = { ...params, id: generateId('cron'), enabled: true };
    this.addJob(task);
    this.jobs.get(task.id)!.job.start();
    await this.persist();
    log.info(`task added: ${task.name} (${task.id})`);
  }

  @register('cron.remove', {
    description: 'Remove a scheduled cron task.',
    schema: z.object({ id: z.string() }),
  })
  async remove(params: EventMap['cron.remove']['params']): Promise<void> {
    const entry = this.jobs.get(params.id);
    if (!entry) return;
    entry.job.stop();
    this.jobs.delete(params.id);
    this.ephemeralIds.delete(params.id);
    this.activeTasks.delete(params.id);
    await this.persist();
    log.info(`task removed: ${params.id}`);
  }

  @register('cron.update', {
    description: 'Update a scheduled cron task.',
    schema: z.object({
      id:       z.string(),
      name:     z.string().optional(),
      schedule: z.string().optional(),
      task:     z.string().optional(),
      enabled:  z.boolean().optional(),
      notify:   z.array(z.string()).optional(),
    }),
  })
  async update(params: CronUpdateParams): Promise<void> {
    const entry = this.jobs.get(params.id);
    if (!entry) throw new Error(`No task with id: ${params.id}`);

    const updated: CronTask = { ...entry.task, ...params };

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

    await this.persist();
    log.info(`task updated: ${params.id}`);
  }

  @register('cron.run', {
    description: 'Manually trigger a cron task immediately.',
    schema: z.object({ id: z.string() }),
  })
  async run(params: EventMap['cron.run']['params']): Promise<void> {
    const entry = this.jobs.get(params.id);
    if (!entry) throw new Error(`No task with id: ${params.id}`);
    await this.executeTask(entry.task);
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
      if (task.enabled) { job.start(); count++; }
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
    if (!entry || !entry.task.enabled) return;

    const hook = this.beforeFireHooks.get(id);
    const check = hook ? hook() : Promise.resolve(true);

    check.then(async (shouldFire) => {
      if (!shouldFire) return;
      this.activeTasks.add(id);
      try {
        await this.executeTask(entry.task);
      } catch (err) {
        log.error(`task execution error: ${id}: ${err instanceof Error ? err.message : err}`);
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

    // If subagents are still running, delivery may be deferred by the agent runtime.
    const { activeRuns } = await this.bus.call('agent.status', {});
    const prefix = sessionKey + ':subagent:';
    if (activeRuns.some(r => r.startsWith(prefix))) {
      log.info(`${task.id} spawned subagents — delivery deferred`);
      return;
    }

    await this.deliver(task.notify, cleaned);
  }

  private async deliver(targets: string[], text: string): Promise<void> {
    for (const target of targets) {
      await this.bus.call('channel.send', {
        sessionKey: target, text,
      }).catch(err => log.error(`notify send to ${target}: ${toMessage(err)}`));
    }
  }

  // ── Heartbeat ─────────────────────────────────────────────────────────────

  private registerHeartbeat(hb: HeartbeatConfig): void {
    const intervalMinutes = hb.intervalMinutes ?? 30;
    const schedule = `*/${intervalMinutes} * * * *`;

    const task: CronTask = {
      id:       'heartbeat',
      name:     'Heartbeat',
      schedule,
      task:     DEFAULT_HEARTBEAT_PROMPT,
      enabled:  true,
      notify:   hb.notify,
    };

    this.addJob(task, { ephemeral: true });
    if (task.enabled) this.jobs.get(task.id)!.job.start();

    const { workspaceDir } = getDataPaths();

    this.beforeFireHooks.set(task.id, async () => {
      if (!isWithinActiveHours(hb.activeHours, hb.activeHoursTimezone)) return false;

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

    log.info(`heartbeat registered: every ${intervalMinutes}m`);
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  private listPersistable(): CronTask[] {
    return Array.from(this.jobs.values())
      .filter(e => !this.ephemeralIds.has(e.task.id))
      .map(e => e.task);
  }

  private async persist(): Promise<void> {
    const config = await this.bus.call('config.get', {});
    await this.bus.call('config.set', {
      ...config,
      cron: { tasks: this.listPersistable() },
    }).catch(err => log.error(`persist: ${toMessage(err)}`));
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop(): void }> {
  const config = await bus.call('config.get', {});
  const svc = new CronService(bus, config);
  svc.start();
  bus.bootstrap(svc);
  log.info(`started with ${config.cron.tasks.length} tasks`);
  return { stop: () => svc.stop() };
}
