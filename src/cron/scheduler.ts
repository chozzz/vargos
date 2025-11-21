/**
 * Cron scheduling system for Vargos
 * Time-based task execution with subagent spawning
 */

import { CronJob } from 'cron';
import { getSessionService } from '../services/factory.js';
import { getPiAgentRuntime } from '../pi/runtime.js';
import path from 'node:path';
import os from 'node:os';

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

  constructor(workspaceDir: string = path.join(os.homedir(), '.vargos', 'workspace')) {
    this.workspaceDir = workspaceDir;
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
    console.log(`[Cron] Executing task: ${task.name}`);

    const sessions = getSessionService();
    const sessionKey = `cron:${task.id}:${Date.now()}`;

    // Create parent session for this cron run
    await sessions.create({
      sessionKey,
      kind: 'main',
      label: `Cron: ${task.name}`,
      metadata: {
        cronTaskId: task.id,
        scheduledAt: new Date().toISOString(),
      },
    });

    // Add task description
    await sessions.addMessage({
      sessionKey,
      content: task.task,
      role: 'user',
      metadata: { type: 'cron_task' },
    });

    // Spawn subagent to handle the task
    const runtime = getPiAgentRuntime();
    
    // Get session file path for Pi SDK
    const dataDir = path.join(os.homedir(), '.vargos');
    const sessionFile = path.join(dataDir, 'sessions', `${sessionKey.replace(/:/g, '-')}.jsonl`);

    runtime.run({
      sessionKey,
      sessionFile,
      workspaceDir: this.workspaceDir,
      contextFiles: [],
    }).then(result => {
      if (result.success) {
        console.log(`[Cron] Task ${task.name} completed successfully`);
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

export function getCronScheduler(workspaceDir?: string): CronScheduler {
  if (!globalScheduler) {
    globalScheduler = new CronScheduler(workspaceDir);
  }
  return globalScheduler;
}

export function initializeCronScheduler(workspaceDir?: string): CronScheduler {
  globalScheduler = new CronScheduler(workspaceDir);
  return globalScheduler;
}
