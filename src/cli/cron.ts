import chalk from 'chalk';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { connectToGateway } from './client.js';
import { resolveDataDir } from '../config/paths.js';
import { loadConfig } from '../config/pi-config.js';
import type { CronTask } from '../contracts/cron.js';

const DIM = chalk.dim;
const LABEL = chalk.gray;
const BOLD = chalk.bold;

function formatSchedule(cron: string): string {
  // Common cron patterns → human-readable
  const patterns: Record<string, string> = {
    '*/30 * * * *': 'every 30 min',
    '*/1 * * * *': 'every minute',
    '0 9,21 * * *': 'daily at 9am & 9pm',
    '0 */6 * * *': 'every 6 hours',
    '0 * * * *': 'every hour',
  };
  return patterns[cron] ?? cron;
}

export async function list(): Promise<void> {
  const client = await connectToGateway();

  try {
    const tasks = await client.call<CronTask[]>('cron', 'cron.list', {});

    if (tasks.length === 0) {
      console.log(chalk.yellow('  No scheduled tasks.'));
      return;
    }

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
  } finally {
    await client.disconnect();
  }
}

export async function trigger(args?: string[]): Promise<void> {
  const taskId = args?.[0];
  if (!taskId) {
    console.error(chalk.red('  Usage: vargos cron trigger <task-id>'));
    process.exit(1);
  }

  const client = await connectToGateway();

  try {
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
  const filter = args?.[0]; // optional: 'cron', 'heartbeat', or a specific task id

  let files: string[];
  try {
    files = await fs.readdir(sessionsDir);
  } catch {
    console.log(chalk.yellow('  No sessions directory found.'));
    return;
  }

  // Filter to cron session files
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

  // Show last 10 executions
  const show = cronFiles.slice(0, 10);
  for (const file of show) {
    const filePath = path.join(sessionsDir, file);
    const stat = await fs.stat(filePath);
    const age = formatAge(stat.mtimeMs);
    const size = formatSize(stat.size);

    // Read last entry for result summary
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

export async function heartbeat(): Promise<void> {
  const config = await loadConfig(resolveDataDir());

  console.log(`\n  ${BOLD('Heartbeat')}\n`);

  if (!config?.heartbeat?.enabled) {
    console.log(chalk.yellow('  Heartbeat is disabled.'));
    console.log(DIM('  Enable in config.json: { "heartbeat": { "enabled": true } }'));
    console.log();
    return;
  }

  const hb = config.heartbeat;
  console.log(`    ${LABEL('Status')}      ${chalk.green('enabled')}`);
  console.log(`    ${LABEL('Schedule')}    ${formatSchedule(hb.every ?? '*/30 * * * *')} ${DIM(`(${hb.every ?? '*/30 * * * *'})`)}`);

  if (hb.activeHours) {
    console.log(`    ${LABEL('Hours')}       ${hb.activeHours.start} - ${hb.activeHours.end} ${DIM(hb.activeHours.timezone)}`);
  } else {
    console.log(`    ${LABEL('Hours')}       ${DIM('always active')}`);
  }

  if (hb.prompt) {
    console.log(`    ${LABEL('Prompt')}      ${hb.prompt.slice(0, 60)}${hb.prompt.length > 60 ? '...' : ''}`);
  }

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
