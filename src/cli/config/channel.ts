import chalk from 'chalk';
import { pick } from '../pick.js';
import { loadAndValidate } from '../boot.js';
import { maskSecret } from '../../lib/mask.js';

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
    const token = entry.botToken ? `   botToken: ${maskSecret(entry.botToken)}` : '';
    console.log(`    ${chalk.white(name)}   ${status}${token}`);
  }
  console.log();
}

export async function edit(): Promise<void> {
  const channel = await pick('Channel to set up', [
    { value: 'whatsapp', label: 'WhatsApp (scan QR code)' },
    { value: 'telegram', label: 'Telegram (paste bot token)' },
  ]);
  if (channel === null) return;

  const { setupWhatsApp, setupTelegram } = await import('../../channels/onboard.js');
  if (channel === 'whatsapp') await setupWhatsApp();
  else await setupTelegram();
}
