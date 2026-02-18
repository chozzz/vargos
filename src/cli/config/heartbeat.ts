import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { select, text, confirm, isCancel } from '@clack/prompts';
import chalk from 'chalk';
import { resolveDataDir, resolveWorkspaceDir } from '../../config/paths.js';
import { loadConfig, saveConfig } from '../../config/pi-config.js';
import type { HeartbeatConfig, ActiveHoursConfig } from '../../config/pi-config.js';

const DIM = chalk.dim;
const LABEL = chalk.gray;
const BOLD = chalk.bold;

function formatSchedule(cron: string): string {
  const patterns: Record<string, string> = {
    '*/30 * * * *': 'every 30 min',
    '*/15 * * * *': 'every 15 min',
    '*/1 * * * *': 'every minute',
    '0 */6 * * *': 'every 6 hours',
    '0 * * * *': 'every hour',
  };
  return patterns[cron] ?? cron;
}

export async function show(): Promise<void> {
  const config = await loadConfig(resolveDataDir());

  console.log(`\n  ${BOLD('Heartbeat')}\n`);

  if (!config?.heartbeat?.enabled) {
    console.log(`    ${LABEL('Status')}      ${chalk.yellow('disabled')}`);
    // Show configured values even when disabled
    if (config?.heartbeat) {
      const hb = config.heartbeat;
      const schedule = hb.every ?? '*/30 * * * *';
      console.log(`    ${LABEL('Schedule')}    ${formatSchedule(schedule)} ${DIM(`(${schedule})`)}`);
      if (hb.activeHours) {
        console.log(`    ${LABEL('Hours')}       ${hb.activeHours.start} - ${hb.activeHours.end} ${DIM(hb.activeHours.timezone)}`);
      }
    }
    console.log(DIM('\n  Enable: vargos config heartbeat edit'));
    console.log();
    return;
  }

  const hb = config.heartbeat;
  const schedule = hb.every ?? '*/30 * * * *';
  console.log(`    ${LABEL('Status')}      ${chalk.green('enabled')}`);
  console.log(`    ${LABEL('Schedule')}    ${formatSchedule(schedule)} ${DIM(`(${schedule})`)}`);

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

export async function edit(): Promise<void> {
  const dataDir = resolveDataDir();
  const config = await loadConfig(dataDir);
  if (!config) {
    console.log(chalk.yellow('\n  No config found. Run: vargos config\n'));
    return;
  }

  const hb = config.heartbeat ?? {};

  // Toggle enabled
  const enabled = await confirm({
    message: 'Enable heartbeat?',
    initialValue: hb.enabled ?? false,
  });
  if (isCancel(enabled)) return;

  if (!enabled) {
    config.heartbeat = { ...hb, enabled: false };
    await saveConfig(dataDir, config);
    console.log(chalk.green('\n  Heartbeat disabled.\n'));
    return;
  }

  // Schedule
  const schedule = await select({
    message: 'Poll frequency',
    options: [
      { value: '*/15 * * * *', label: 'Every 15 minutes' },
      { value: '*/30 * * * *', label: 'Every 30 minutes (recommended)' },
      { value: '0 * * * *', label: 'Every hour' },
      { value: '0 */6 * * *', label: 'Every 6 hours' },
    ],
    initialValue: hb.every ?? '*/30 * * * *',
  });
  if (isCancel(schedule)) return;

  // Active hours
  const useActiveHours = await confirm({
    message: 'Restrict to active hours?',
    initialValue: !!hb.activeHours,
  });
  if (isCancel(useActiveHours)) return;

  let activeHours: ActiveHoursConfig | undefined;
  if (useActiveHours) {
    const start = await text({
      message: 'Start time (HH:MM)',
      defaultValue: hb.activeHours?.start ?? '08:00',
      placeholder: '08:00',
      validate: (v) => /^\d{2}:\d{2}$/.test(v ?? '') ? undefined : 'Use HH:MM format',
    });
    if (isCancel(start)) return;

    const end = await text({
      message: 'End time (HH:MM)',
      defaultValue: hb.activeHours?.end ?? '22:00',
      placeholder: '22:00',
      validate: (v) => /^\d{2}:\d{2}$/.test(v ?? '') ? undefined : 'Use HH:MM format',
    });
    if (isCancel(end)) return;

    const timezone = await text({
      message: 'Timezone (IANA)',
      defaultValue: hb.activeHours?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      placeholder: 'Australia/Sydney',
    });
    if (isCancel(timezone)) return;

    activeHours = { start, end, timezone };
  }

  const updated: HeartbeatConfig = {
    enabled: true,
    every: schedule,
  };
  if (activeHours) updated.activeHours = activeHours;
  if (hb.prompt) updated.prompt = hb.prompt; // preserve custom prompt

  config.heartbeat = updated;
  await saveConfig(dataDir, config);

  console.log(chalk.green(`\n  Heartbeat enabled — ${formatSchedule(schedule)}`));
  if (activeHours) {
    console.log(chalk.green(`  Active hours: ${activeHours.start} - ${activeHours.end} ${activeHours.timezone}`));
  }
  console.log(DIM('  Restart gateway to apply changes.\n'));
}

export async function tasks(): Promise<void> {
  const filePath = path.join(resolveWorkspaceDir(), 'HEARTBEAT.md');

  try {
    await fs.access(filePath);
  } catch {
    console.log(chalk.yellow('  HEARTBEAT.md not found. Run gateway first to initialize workspace.\n'));
    return;
  }

  const editor = process.env.EDITOR || process.env.VISUAL || 'nano';
  const child = spawn(editor, [filePath], { stdio: 'inherit' });
  await new Promise<void>((resolve, reject) => {
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${editor} exited with ${code}`)));
    child.on('error', reject);
  });
}
