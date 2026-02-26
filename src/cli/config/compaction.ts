import chalk from 'chalk';
import { pick, pickConfirm } from '../pick.js';
import { resolveDataDir } from '../../config/paths.js';
import { loadConfig, saveConfig } from '../../config/pi-config.js';
import type { CompactionConfig } from '../../config/pi-config.js';

const DIM = chalk.dim;
const LABEL = chalk.gray;
const BOLD = chalk.bold;

export async function show(): Promise<void> {
  const config = await loadConfig(resolveDataDir());
  const c = config?.compaction;

  console.log(`\n  ${BOLD('Compaction')}\n`);

  const cpEnabled = c?.contextPruning?.enabled !== false;
  console.log(`    ${LABEL('Context Pruning')}  ${cpEnabled ? chalk.green('enabled') : chalk.yellow('disabled')}`);
  if (cpEnabled) {
    const cp = c?.contextPruning;
    console.log(`    ${LABEL('  Keep Last')}     ${cp?.keepLastAssistants ?? 3} assistant messages`);
    console.log(`    ${LABEL('  Soft Trim')}     ratio ${cp?.softTrimRatio ?? 0.3}, max ${cp?.softTrim?.maxChars ?? 4000} chars`);
    console.log(`    ${LABEL('  Hard Clear')}    ratio ${cp?.hardClearRatio ?? 0.5}`);
    if (cp?.tools?.allow?.length) {
      console.log(`    ${LABEL('  Allow')}         ${cp.tools.allow.join(', ')}`);
    }
    if (cp?.tools?.deny?.length) {
      console.log(`    ${LABEL('  Deny')}          ${cp.tools.deny.join(', ')}`);
    }
  }

  const sgEnabled = c?.safeguard?.enabled !== false;
  console.log(`    ${LABEL('Safeguard')}       ${sgEnabled ? chalk.green('enabled') : chalk.yellow('disabled')}`);
  if (sgEnabled) {
    console.log(`    ${LABEL('  History Share')} ${c?.safeguard?.maxHistoryShare ?? 0.5}`);
  }

  if (!c) console.log(DIM('\n  Using defaults. Customize: vargos config compaction edit'));
  console.log();
}

export async function edit(): Promise<void> {
  const dataDir = resolveDataDir();
  const config = await loadConfig(dataDir);
  if (!config) {
    console.log(chalk.yellow('\n  No config found. Run: vargos config\n'));
    return;
  }

  const existing = config.compaction ?? {};
  const updated: CompactionConfig = { ...existing };

  const cpEnabled = await pickConfirm('Enable context pruning?', existing.contextPruning?.enabled !== false);
  if (cpEnabled === null) return;

  if (!cpEnabled) {
    updated.contextPruning = { ...existing.contextPruning, enabled: false };
  } else {
    const preset = await pick('Pruning aggressiveness', [
      { value: 'conservative', label: 'Conservative — trim only very large results' },
      { value: 'balanced', label: 'Balanced (recommended)' },
      { value: 'aggressive', label: 'Aggressive — trim early, save context' },
    ], 'balanced');
    if (preset === null) return;

    const presets: Record<string, { softTrimRatio: number; hardClearRatio: number }> = {
      conservative: { softTrimRatio: 0.5, hardClearRatio: 0.7 },
      balanced: { softTrimRatio: 0.3, hardClearRatio: 0.5 },
      aggressive: { softTrimRatio: 0.15, hardClearRatio: 0.3 },
    };

    const { softTrimRatio, hardClearRatio } = presets[preset];
    updated.contextPruning = {
      ...existing.contextPruning,
      enabled: true,
      softTrimRatio,
      hardClearRatio,
    };
  }

  const sgEnabled = await pickConfirm('Enable compaction safeguard?', existing.safeguard?.enabled !== false);
  if (sgEnabled === null) return;

  if (!sgEnabled) {
    updated.safeguard = { ...existing.safeguard, enabled: false };
  } else {
    updated.safeguard = { ...existing.safeguard, enabled: true };
  }

  config.compaction = updated;
  await saveConfig(dataDir, config);

  console.log(chalk.green('\n  Compaction settings saved.'));
  console.log(DIM('  Restart gateway to apply changes.\n'));
}
