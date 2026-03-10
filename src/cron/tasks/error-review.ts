/**
 * Error review cron task — periodic analysis of errors.jsonl
 *
 * Reads recent errors, skips if none found, otherwise prompts the agent
 * to group by pattern and write actionable findings to HEARTBEAT.md.
 */

import type { CronTask, CronTaskInput } from '../types.js';
import type { ErrorReviewConfig } from '../../config/pi-config.js';
import { readErrors } from '../../lib/error-store.js';

interface CronScheduler {
  addTask(task: CronTaskInput, opts?: { ephemeral?: boolean }): CronTask;
  onBeforeFire(taskId: string, hook: (task: CronTask) => Promise<boolean>): void;
}

const DEFAULT_PROMPT = [
  'Review the error log at ~/.vargos/errors.jsonl.',
  'Read the file, group errors by class and recurring patterns.',
  'For each pattern: count occurrences, identify root cause, suggest a fix.',
  'Write a concise summary to the "Error Review" section of HEARTBEAT.md.',
  'Use checklist format (- [ ] ...) so heartbeat can track resolution.',
  'If all errors are transient retries with no actionable fix, reply: HEARTBEAT_OK',
].join(' ');

export function createErrorReviewTask(
  scheduler: CronScheduler,
  config: ErrorReviewConfig,
): CronTask {
  const sinceHours = config.sinceHours ?? 24;

  const task = scheduler.addTask({
    id: 'error-review',
    name: 'Error Review',
    schedule: config.schedule ?? '0 20 * * *', // 6am AEST (UTC+10)
    description: 'Analyze recent errors and write findings to HEARTBEAT.md',
    task: config.prompt ?? DEFAULT_PROMPT,
    enabled: true,
    notify: config.notify,
  }, { ephemeral: true });

  scheduler.onBeforeFire(task.id, async () => {
    const errors = await readErrors({ sinceHours });
    if (errors.length === 0) return false;
    return true;
  });

  return task;
}
