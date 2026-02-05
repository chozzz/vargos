/**
 * Cron scheduling system for Vargos
 * Time-based task execution with subagent spawning
 */

import { CronJob } from 'cron';
import { getSessionService } from '../services/factory.js';
import { getPiAgentRuntime } from '../agent/runtime.js';
import { resolveSessionFile, resolveDataDir } from '../config/paths.js';
import { loadConfig } from '../config/pi-config.js';

export interface CronTask {
  id: string;
  name: string;
  schedule: string; // Cron expression
  description: string;
  task: string;
  enabled: boolean;
}

export interface CronJobInstance {
  task: CronTask;
  job: CronJob;
}

export class CronScheduler {
  private jobs: Map<string, CronJobInstance> = new Map();
  private workspaceDir: string;
  private dataDir: string;

  constructor(workspaceDir: string, dataDir: string = resolveDataDir()) {
    this.workspaceDir = workspaceDir;
    this.dataDir = dataDir;
  }

  /**
   * Add a new cron task
   */
  addTask(task: Omit<CronTask, 'id'>): CronTask {
    const id = `cron-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const fullTask: CronTask = { ...task, id };

    const job = new CronJob(
      task.schedule,
      () => this.executeTask(fullTask),
      null,
      task.enabled,
      'UTC'
    );

    this.jobs.set(id, { task: fullTask, job });
    return fullTask;
  }

  /**
   * Remove a task
   */
  removeTask(id: string): boolean {
    const instance = this.jobs.get(id);
    if (instance) {
      instance.job.stop();
      this.jobs.delete(id);
      return true;
    }
    return false;
  }

  /**
   * List all tasks
   */
  listTasks(): CronTask[] {
    return Array.from(this.jobs.values()).map(i => i.task);
  }

  /**
   * Stop all jobs
   */
  stopAll(): void {
    for (const instance of this.jobs.values()) {
      instance.job.stop();
    }
  }

  /**
   * Start all enabled jobs
   */
  startAll(): void {
    for (const instance of this.jobs.values()) {
      if (instance.task.enabled) {
        instance.job.start();
      }
    }
  }

  /**
   * Execute a task by spawning subagents
   */
  private async executeTask(task: CronTask): Promise<void> {
    console.error(`[Cron] Executing task: ${task.name}`);

    const sessions = getSessionService();
    const sessionKey = `cron:${task.id}:${Date.now()}`;

    await sessions.create({
      sessionKey,
      kind: 'main',
      label: `Cron: ${task.name}`,
      metadata: {
        cronTaskId: task.id,
        scheduledAt: new Date().toISOString(),
      },
    });

    await sessions.addMessage({
      sessionKey,
      content: task.task,
      role: 'user',
      metadata: { type: 'cron_task' },
    });

    const runtime = getPiAgentRuntime();
    const sessionFile = resolveSessionFile(sessionKey);

    const config = await loadConfig(this.dataDir);
    if (!config) {
      console.error(`[Cron] No config.json — skipping task ${task.name}`);
      return;
    }
    const { provider, model } = config.agent;
    const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
    const apiKey = envKey || config.agent.apiKey;

    runtime.run({
      sessionKey,
      sessionFile,
      workspaceDir: this.workspaceDir,
      model,
      provider,
      apiKey,
      baseUrl: config.agent.baseUrl,
    }).then(result => {
      if (result.success) {
        console.error(`[Cron] Task ${task.name} completed`);
      } else {
        console.error(`[Cron] Task ${task.name} failed:`, result.error);
      }
    }).catch(err => {
      console.error(`[Cron] Task ${task.name} error:`, err);
    });
  }
}

// Singleton instance
let globalScheduler: CronScheduler | null = null;

export function getCronScheduler(): CronScheduler {
  if (!globalScheduler) {
    throw new Error('CronScheduler not initialized — call initializeCronScheduler() first');
  }
  return globalScheduler;
}

export function initializeCronScheduler(workspaceDir: string, dataDir?: string): CronScheduler {
  globalScheduler = new CronScheduler(workspaceDir, dataDir);
  return globalScheduler;
}
