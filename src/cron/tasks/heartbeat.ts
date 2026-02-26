/**
 * Heartbeat cron task — periodic poll with smart skip logic
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CronTask, CronTaskInput } from '../types.js';
import type { HeartbeatConfig } from '../../config/pi-config.js';
import {
  isHeartbeatContentEffectivelyEmpty,
  isWithinActiveHours,
} from '../../lib/heartbeat.js';

interface CronScheduler {
  addTask(task: CronTaskInput, opts?: { ephemeral?: boolean }): CronTask;
  onBeforeFire(taskId: string, hook: (task: CronTask) => Promise<boolean>): void;
}

const DEFAULT_PROMPT = [
  'This is a heartbeat poll. Read HEARTBEAT.md if it exists.',
  'Follow any tasks listed strictly.',
  'Do not infer tasks from previous sessions or memory.',
  'If nothing needs attention, reply with exactly: HEARTBEAT_OK',
].join(' ');

export function createHeartbeatTask(
  scheduler: CronScheduler,
  config: HeartbeatConfig,
  workspaceDir: string,
  getActiveRunCount: () => number,
): CronTask {
  const task = scheduler.addTask({
    id: 'heartbeat',
    name: 'Heartbeat',
    schedule: config.every ?? '*/30 * * * *',
    description: 'Periodic heartbeat poll — checks HEARTBEAT.md for pending tasks',
    task: config.prompt ?? DEFAULT_PROMPT,
    enabled: true,
  }, { ephemeral: true });

  scheduler.onBeforeFire(task.id, async () => {
    // 1. Outside active hours → skip
    if (!isWithinActiveHours(config.activeHours)) return false;

    // 2. Agent busy → skip
    if (getActiveRunCount() > 0) return false;

    // 3. HEARTBEAT.md missing or empty → skip
    try {
      const content = await fs.readFile(path.join(workspaceDir, 'HEARTBEAT.md'), 'utf-8');
      if (isHeartbeatContentEffectivelyEmpty(content)) return false;
    } catch {
      return false; // missing file → skip
    }

    return true;
  });

  return task;
}
