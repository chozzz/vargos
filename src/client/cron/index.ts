/**
 * Cron service — scheduled task execution via events
 *
 * Methods: cron.list, cron.add, cron.remove, cron.run
 * Events:  cron.trigger
 *
 * Unlike the old scheduler, this service does NOT call getPiAgentRuntime()
 * or getSessionService() directly. It just emits cron.trigger events.
 * The agent service subscribes and handles execution.
 */

import { CronJob } from 'cron';
import { ServiceClient } from '../client.js';
import type { CronTask } from '../../contracts/cron.js';

export type { CronTask };

export interface CronServiceConfig {
  gatewayUrl?: string;
  onPersist?: (tasks: CronTask[]) => Promise<void>;
}

export class CronService extends ServiceClient {
  private jobs = new Map<string, { task: CronTask; job: CronJob }>();
  private hooks = new Map<string, (task: CronTask) => Promise<boolean>>();
  private onPersist?: (tasks: CronTask[]) => Promise<void>;

  constructor(config: CronServiceConfig = {}) {
    super({
      service: 'cron',
      methods: ['cron.list', 'cron.add', 'cron.remove', 'cron.run'],
      events: ['cron.trigger'],
      subscriptions: [],
      gatewayUrl: config.gatewayUrl,
    });
    this.onPersist = config.onPersist;
  }

  async handleMethod(method: string, params: unknown): Promise<unknown> {
    const p = params as Record<string, unknown>;

    switch (method) {
      case 'cron.list':
        return this.listTasks();

      case 'cron.add':
        return this.addTask(p as Omit<CronTask, 'id'>);

      case 'cron.remove':
        return this.removeTask(p.id as string);

      case 'cron.run':
        return this.triggerTask(p.id as string);

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  handleEvent(): void {
    // Cron service subscribes to nothing
  }

  addTask(task: Omit<CronTask, 'id'>): CronTask {
    const id = `cron-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const fullTask: CronTask = { ...task, id };

    const job = new CronJob(
      task.schedule,
      () => this.onTaskFire(fullTask),
      null,
      task.enabled,
      'UTC',
    );

    this.jobs.set(id, { task: fullTask, job });
    if (!fullTask.builtIn) this.persistUserTasks();
    return fullTask;
  }

  removeTask(id: string): boolean {
    const entry = this.jobs.get(id);
    if (!entry) return false;
    entry.job.stop();
    this.jobs.delete(id);
    if (!entry.task.builtIn) this.persistUserTasks();
    return true;
  }

  listTasks(): CronTask[] {
    return Array.from(this.jobs.values()).map((e) => e.task);
  }

  private persistUserTasks(): void {
    if (!this.onPersist) return;
    const userTasks = this.listTasks().filter((t) => !t.builtIn);
    this.onPersist(userTasks).catch(() => {});
  }

  startAll(): void {
    for (const { task, job } of this.jobs.values()) {
      if (task.enabled) job.start();
    }
  }

  stopAll(): void {
    for (const { job } of this.jobs.values()) {
      job.stop();
    }
  }

  onBeforeFire(taskId: string, hook: (task: CronTask) => Promise<boolean>): void {
    this.hooks.set(taskId, hook);
  }

  private async onTaskFire(task: CronTask): Promise<void> {
    const hook = this.hooks.get(task.id);
    if (hook) {
      const shouldFire = await hook(task).catch(() => true);
      if (!shouldFire) return;
    }
    const sessionKey = `cron:${task.id}:${Date.now()}`;
    this.emit('cron.trigger', { taskId: task.id, task: task.task, name: task.name, sessionKey });
  }

  private async triggerTask(id: string): Promise<boolean> {
    const entry = this.jobs.get(id);
    if (!entry) throw new Error(`No task with id: ${id}`);
    await this.onTaskFire(entry.task);
    return true;
  }
}
