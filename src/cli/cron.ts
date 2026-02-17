import chalk from 'chalk';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { select, text, isCancel } from '@clack/prompts';
import { connectToGateway } from './client.js';
import { resolveDataDir } from '../config/paths.js';
import type { CronTask } from '../contracts/cron.js';

const DIM = chalk.dim;
const LABEL = chalk.gray;
const BOLD = chalk.bold;

const SCHEDULE_PRESETS: Record<string, string> = {
  '*/30 * * * *': 'every 30 min',
  '*/1 * * * *': 'every minute',
  '0 9,21 * * *': 'daily at 9am & 9pm',
  '0 */6 * * *': 'every 6 hours',
  '0 * * * *': 'every hour',
};

function formatSchedule(cron: string): string {
  return SCHEDULE_PRESETS[cron] ?? cron;
}

export async function list(): Promise<void> {
  const client = await connectToGateway();

  try {
    const tasks = await client.call<CronTask[]>('cron', 'cron.list', {});

    if (tasks.length === 0) {
      console.log(chalk.yellow('  No scheduled tasks.'));
      return;
    }

    printTasks(tasks);

    // Interactive mode: offer actions on tasks
    if (!process.stdin.isTTY) return;

    const action = await select({
      message: 'Action',
      options: [
        { value: 'trigger', label: 'Trigger', hint: 'Run a task now' },
        { value: 'remove', label: 'Remove', hint: 'Remove a task' },
        { value: 'done', label: 'Done' },
      ],
    });
    if (isCancel(action) || action === 'done') return;

    if (action === 'trigger') {
      const picked = await select({
        message: 'Select task to trigger',
        options: tasks.map((t) => ({ value: t.id, label: t.name, hint: formatSchedule(t.schedule) })),
      });
      if (isCancel(picked)) return;
      await client.call('cron', 'cron.run', { id: picked });
      console.log(chalk.green(`  Triggered task: ${picked}`));
    } else if (action === 'remove') {
      const picked = await select({
        message: 'Select task to remove',
        options: tasks.map((t) => ({ value: t.id, label: t.name, hint: formatSchedule(t.schedule) })),
      });
      if (isCancel(picked)) return;
      const removed = await client.call<boolean>('cron', 'cron.remove', { id: picked });
      if (removed) {
        console.log(chalk.green(`  Removed task: ${picked}`));
      } else {
        console.log(chalk.yellow(`  Task not found: ${picked}`));
      }
    }
  } finally {
    await client.disconnect();
  }
}

function printTasks(tasks: CronTask[]): void {
  console.log(`\n  ${BOLD('Scheduled Tasks')}\n`);
  for (const task of tasks) {
    const status = task.enabled ? chalk.green('on') : chalk.red('off');
    console.log(`    ${chalk.cyan(task.name)} ${DIM(`[${status}]`)}`);
    const human = formatSchedule(task.schedule);
    const scheduleDisplay = human !== task.schedule
      ? `${human} ${DIM(`(${task.schedule})`)}`
      : task.schedule;
    console.log(`      ${LABEL('Schedule')}  ${scheduleDisplay}`);
    console.log(`      ${LABEL('Task')}      ${truncateAtWord(task.task.replace(/\n/g, ' ').trim(), 80)}`);
    console.log(`      ${LABEL('ID')}        ${DIM(task.id)}`);
    console.log();
  }
}

export async function add(): Promise<void> {
  const name = await text({
    message: 'Task name',
    placeholder: 'daily-report',
    validate: (v) => (v?.trim() ? undefined : 'Name is required'),
  });
  if (isCancel(name)) return;

  const schedule = await select({
    message: 'Schedule',
    options: [
      { value: '*/30 * * * *', label: 'Every 30 minutes' },
      { value: '0 * * * *', label: 'Every hour' },
      { value: '0 */6 * * *', label: 'Every 6 hours' },
      { value: '0 9,21 * * *', label: 'Daily at 9am & 9pm' },
      { value: '__custom__', label: 'Custom cron expression' },
    ],
  });
  if (isCancel(schedule)) return;

  let finalSchedule: string = schedule;
  if (schedule === '__custom__') {
    const custom = await text({
      message: 'Cron expression',
      placeholder: '0 */2 * * *',
      validate: (v) => (v?.trim() ? undefined : 'Expression is required'),
    });
    if (isCancel(custom)) return;
    finalSchedule = custom;
  }

  const task = await text({
    message: 'Task description (prompt for the agent)',
    placeholder: 'Generate a daily summary of recent changes',
    validate: (v) => (v?.trim() ? undefined : 'Task is required'),
  });
  if (isCancel(task)) return;

  const client = await connectToGateway();
  try {
    const created = await client.call<CronTask>('cron', 'cron.add', {
      name,
      schedule: finalSchedule,
      description: task.slice(0, 100),
      task,
      enabled: true,
    });
    console.log(chalk.green(`\n  Created task: ${created.name}`));
    console.log(`  ${LABEL('ID')}        ${DIM(created.id)}`);
    console.log(`  ${LABEL('Schedule')}  ${formatSchedule(finalSchedule)}`);
    console.log();
  } catch (err) {
    console.error(chalk.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
  } finally {
    await client.disconnect();
  }
}

export async function remove(args?: string[]): Promise<void> {
  const client = await connectToGateway();

  try {
    let taskId = args?.[0];

    if (!taskId) {
      const tasks = await client.call<CronTask[]>('cron', 'cron.list', {});
      if (tasks.length === 0) {
        console.log(chalk.yellow('  No scheduled tasks to remove.'));
        return;
      }

      const picked = await select({
        message: 'Select task to remove',
        options: tasks.map((t) => ({
          value: t.id,
          label: t.name,
          hint: formatSchedule(t.schedule),
        })),
      });
      if (isCancel(picked)) return;
      taskId = picked;
    }

    const removed = await client.call<boolean>('cron', 'cron.remove', { id: taskId });
    if (removed) {
      console.log(chalk.green(`  Removed task: ${taskId}`));
    } else {
      console.log(chalk.yellow(`  Task not found: ${taskId}`));
    }
  } catch (err) {
    console.error(chalk.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
  } finally {
    await client.disconnect();
  }
}

export async function trigger(args?: string[]): Promise<void> {
  const client = await connectToGateway();

  try {
    let taskId = args?.[0];

    if (!taskId) {
      const tasks = await client.call<CronTask[]>('cron', 'cron.list', {});
      if (tasks.length === 0) {
        console.log(chalk.yellow('  No scheduled tasks.'));
        return;
      }

      const picked = await select({
        message: 'Select task to trigger',
        options: tasks.map((t) => ({
          value: t.id,
          label: t.name,
          hint: formatSchedule(t.schedule),
        })),
      });
      if (isCancel(picked)) return;
      taskId = picked;
    }

    await client.call('cron', 'cron.run', { id: taskId });
    console.log(chalk.green(`  Triggered task: ${taskId}`));
  } catch (err) {
    console.error(chalk.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
  } finally {
    await client.disconnect();
  }
}

export async function logs(args?: string[]): Promise<void> {
  const dataDir = resolveDataDir();
  const sessionsDir = path.join(dataDir, 'sessions');
  const filter = args?.[0];

  let files: string[];
  try {
    files = await fs.readdir(sessionsDir);
  } catch {
    console.log(chalk.yellow('  No sessions directory found.'));
    return;
  }

  let cronFiles = files
    .filter((f) => f.startsWith('cron-') && f.endsWith('.jsonl'))
    .sort()
    .reverse();

  if (filter) {
    cronFiles = cronFiles.filter((f) => f.includes(filter));
  }

  if (cronFiles.length === 0) {
    console.log(chalk.yellow(`  No cron execution logs found${filter ? ` matching "${filter}"` : ''}.`));
    return;
  }

  console.log(`\n  ${BOLD('Cron Execution Logs')}${filter ? DIM(` (filter: ${filter})`) : ''}\n`);

  const show = cronFiles.slice(0, 10);
  for (const file of show) {
    const filePath = path.join(sessionsDir, file);
    const stat = await fs.stat(filePath);
    const age = formatAge(stat.mtimeMs);
    const size = formatSize(stat.size);
    const summary = await readLastEntry(filePath);

    console.log(`    ${chalk.cyan(file)} ${DIM(`${age} ago, ${size}`)}`);
    if (summary) {
      console.log(`      ${summary}`);
    }
    console.log();
  }

  if (cronFiles.length > 10) {
    console.log(DIM(`    ... and ${cronFiles.length - 10} more`));
  }

  console.log(DIM(`  Logs dir: ${sessionsDir}`));
  console.log();
}

// -- Helpers --

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(' ', max);
  return (cut > max / 2 ? text.slice(0, cut) : text.slice(0, max)) + '...';
}

function formatAge(mtimeMs: number): string {
  const seconds = Math.floor((Date.now() - mtimeMs) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

async function readLastEntry(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return null;

    const last = JSON.parse(lines[lines.length - 1]);
    if (last.role === 'assistant' && last.content) {
      const text = typeof last.content === 'string' ? last.content : '';
      return text.slice(0, 100) + (text.length > 100 ? '...' : '');
    }
    return DIM(`${lines.length} entries`);
  } catch {
    return null;
  }
}
