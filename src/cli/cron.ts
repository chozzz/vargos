import chalk from 'chalk';
import { select, text, multiselect, isCancel } from '@clack/prompts';
import { connectToGateway, type CliClient } from './client.js';
import { formatSchedule } from '../lib/schedule.js';
import { normalizeTarget } from '../lib/channel-target.js';
import { resolveDataDir } from '../config/paths.js';
import { loadConfig } from '../config/pi-config.js';
import type { CronTask } from '../cron/types.js';
import type { Session, SessionMessage } from '../sessions/types.js';

const DIM = chalk.dim;
const LABEL = chalk.gray;
const BOLD = chalk.bold;

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
        { value: 'edit', label: 'Edit', hint: 'Edit a task' },
        { value: 'trigger', label: 'Trigger', hint: 'Run a task now' },
        { value: 'remove', label: 'Remove', hint: 'Remove a task' },
        { value: 'done', label: 'Done' },
      ],
    });
    if (isCancel(action) || action === 'done') return;

    const taskOptions = tasks.map((t) => ({ value: t.id, label: t.name, hint: formatSchedule(t.schedule) }));

    if (action === 'edit') {
      const picked = await select({ message: 'Select task to edit', options: taskOptions });
      if (isCancel(picked)) return;
      await editTask(client, tasks.find((t) => t.id === picked)!);
    } else if (action === 'trigger') {
      const picked = await select({ message: 'Select task to trigger', options: taskOptions });
      if (isCancel(picked)) return;
      await client.call('cron', 'cron.run', { id: picked });
      console.log(chalk.green(`  Triggered task: ${picked}`));
    } else if (action === 'remove') {
      const picked = await select({ message: 'Select task to remove', options: taskOptions });
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
    if (task.notify?.length) {
      console.log(`      ${LABEL('Notify')}    ${task.notify.join(', ')}`);
    }
    console.log(`      ${LABEL('ID')}        ${DIM(task.id)}`);
    console.log();
  }
}

async function editTask(client: CliClient, task: CronTask): Promise<void> {
  const field = await select({
    message: `Editing: ${task.name}`,
    options: [
      { value: 'name', label: 'Name', hint: task.name },
      { value: 'schedule', label: 'Schedule', hint: formatSchedule(task.schedule) },
      { value: 'task', label: 'Task', hint: truncateAtWord(task.task.replace(/\n/g, ' ').trim(), 50) },
      { value: 'notify', label: 'Notify', hint: task.notify?.length ? task.notify.join(', ') : 'none' },
      { value: 'enabled', label: task.enabled ? 'Disable' : 'Enable', hint: task.enabled ? 'on → off' : 'off → on' },
    ],
  });
  if (isCancel(field)) return;

  const updates: Record<string, unknown> = {};

  if (field === 'name') {
    const val = await text({ message: 'New name', initialValue: task.name, validate: (v) => (v?.trim() ? undefined : 'Required') });
    if (isCancel(val)) return;
    updates.name = val;
  } else if (field === 'schedule') {
    const val = await select({
      message: 'New schedule',
      options: [
        { value: '*/30 * * * *', label: 'Every 30 minutes' },
        { value: '0 * * * *', label: 'Every hour' },
        { value: '0 */6 * * *', label: 'Every 6 hours' },
        { value: '0 9,21 * * *', label: 'Daily at 9am & 9pm' },
        { value: '__custom__', label: 'Custom cron expression' },
      ],
    });
    if (isCancel(val)) return;
    let schedule: string = val;
    if (val === '__custom__') {
      const custom = await text({ message: 'Cron expression', initialValue: task.schedule, validate: (v) => (v?.trim() ? undefined : 'Required') });
      if (isCancel(custom)) return;
      schedule = custom;
    }
    updates.schedule = schedule;
  } else if (field === 'task') {
    const val = await text({ message: 'New task prompt', initialValue: task.task, validate: (v) => (v?.trim() ? undefined : 'Required') });
    if (isCancel(val)) return;
    updates.task = val;
    updates.description = (val as string).slice(0, 100);
  } else if (field === 'notify') {
    const targets = await promptNotifyTargets(task.notify);
    if (targets === null) return;
    updates.notify = targets;
  } else if (field === 'enabled') {
    updates.enabled = !task.enabled;
  }

  try {
    const updated = await client.call<CronTask>('cron', 'cron.update', { id: task.id, ...updates });
    console.log(chalk.green(`  Updated: ${updated.name}`));
  } catch (err) {
    console.error(chalk.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
  }
}

export async function add(): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error(chalk.red('  Use the cron_add tool or config.json to add tasks non-interactively.'));
    process.exit(1);
  }
  const id = await text({
    message: 'Task ID',
    placeholder: 'daily-report',
    validate: (v) => (v?.trim() ? undefined : 'ID is required'),
  });
  if (isCancel(id)) return;

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
    const notify = await promptNotifyTargets();

    const created = await client.call<CronTask>('cron', 'cron.add', {
      id,
      schedule: finalSchedule,
      task,
      enabled: true,
      notify: notify?.length ? notify : undefined,
    });
    console.log(chalk.green(`\n  Created task: ${created.name}`));
    console.log(`  ${LABEL('ID')}        ${DIM(created.id)}`);
    console.log(`  ${LABEL('Schedule')}  ${formatSchedule(finalSchedule)}`);
    if (created.notify?.length) {
      console.log(`  ${LABEL('Notify')}    ${created.notify.join(', ')}`);
    }
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
      if (!process.stdin.isTTY) {
        console.error(chalk.red('  Usage: vargos cron remove <task-id>'));
        process.exit(1);
      }
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
      if (!process.stdin.isTTY) {
        console.error(chalk.red('  Usage: vargos cron trigger <task-id>'));
        process.exit(1);
      }
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
  const filter = args?.[0];
  const client = await connectToGateway();

  try {
    const sessions = await client.call<Session[]>('sessions', 'session.list', { kind: 'cron' });
    let filtered = sessions;
    if (filter) {
      filtered = sessions.filter(s => s.sessionKey.includes(filter));
    }

    if (filtered.length === 0) {
      console.log(chalk.yellow(`  No cron execution logs found${filter ? ` matching "${filter}"` : ''}.`));
      return;
    }

    console.log(`\n  ${BOLD('Cron Execution Logs')}${filter ? DIM(` (filter: ${filter})`) : ''}\n`);

    const show = filtered.slice(0, 10);
    for (const session of show) {
      const updatedAt = new Date(session.updatedAt).getTime();
      const age = formatAge(updatedAt);
      const messages = await client.call<SessionMessage[]>('sessions', 'session.getMessages', {
        sessionKey: session.sessionKey,
      });
      const last = messages[messages.length - 1];
      const summary = last?.role === 'assistant'
        ? last.content.slice(0, 100) + (last.content.length > 100 ? '...' : '')
        : DIM(`${messages.length} entries`);

      console.log(`    ${chalk.cyan(session.sessionKey)} ${DIM(`${age} ago`)}`);
      if (summary) {
        console.log(`      ${summary}`);
      }
      console.log();
    }

    if (filtered.length > 10) {
      console.log(DIM(`    ... and ${filtered.length - 10} more`));
    }

    console.log();
  } finally {
    await client.disconnect();
  }
}

// -- Notify helpers --

/** Build flat list of "channel:userId" from config channels */
async function getChannelTargets(): Promise<string[]> {
  const config = await loadConfig(resolveDataDir());
  if (!config?.channels) return [];
  const targets: string[] = [];
  for (const [channel, entry] of Object.entries(config.channels)) {
    if (entry.enabled === false) continue;
    for (const userId of entry.allowFrom ?? []) {
      targets.push(normalizeTarget(`${channel}:${userId}`));
    }
  }
  return targets;
}

/** Prompt user to select notify targets; returns null on cancel, empty array to clear */
async function promptNotifyTargets(current?: string[]): Promise<string[] | null> {
  const targets = await getChannelTargets();
  if (targets.length === 0) return [];

  const selected = await multiselect({
    message: 'Notify channels (space to toggle, enter to confirm)',
    options: targets.map((t) => ({ value: t, label: t })),
    initialValues: current?.filter((c) => targets.includes(c)) ?? [],
    required: false,
  });
  if (isCancel(selected)) return null;
  return selected as string[];
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

