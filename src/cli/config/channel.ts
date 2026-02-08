import chalk from 'chalk';
import { spawn } from 'node:child_process';
import { loadAndValidate } from '../boot.js';
import { resolveDataDir } from '../../core/config/paths.js';
import { getConfigPath } from '../../core/config/pi-config.js';

function maskToken(token: string): string {
  return token.length > 3 ? '****' + token.slice(-3) : '****';
}

export async function show(): Promise<void> {
  const { config } = await loadAndValidate();
  const channels = config.channels;

  console.log(`\n  ${chalk.bold('Channel Configuration')}\n`);

  if (!channels || Object.keys(channels).length === 0) {
    console.log('    No channels configured.\n');
    return;
  }

  for (const [name, entry] of Object.entries(channels)) {
    const status = entry.enabled !== false ? chalk.green('enabled') : chalk.red('disabled');
    const token = entry.botToken ? `   botToken: ${maskToken(entry.botToken)}` : '';
    console.log(`    ${chalk.white(name)}   ${status}${token}`);
  }
  console.log();
}

export async function edit(): Promise<void> {
  const dataDir = resolveDataDir();
  const configPath = getConfigPath(dataDir);
  const editor = process.env.EDITOR || 'vi';

  console.log(`\n  Opening ${chalk.gray(configPath)} in ${editor}...\n`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(editor, [configPath], { stdio: 'inherit' });
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Editor exited with code ${code}`)));
    child.on('error', reject);
  });
}
