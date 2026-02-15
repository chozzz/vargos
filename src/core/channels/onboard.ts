/**
 * Channel onboarding wizard
 * Interactive setup for WhatsApp and Telegram channels
 * Only handles auth/linking — message processing happens in `pnpm cli server`
 */

import readline from 'node:readline';
import chalk from 'chalk';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadChannelConfigs, addChannelConfig } from './config.js';
import { resolveChannelsDir, resolveDataDir } from '../config/paths.js';
import { createWhatsAppSocket } from '../../extensions/channel-whatsapp/session.js';
import { TelegramAdapter } from '../../extensions/channel-telegram/adapter.js';
import type { ChannelConfig } from './types.js';
import type { WASocket } from '@whiskeysockets/baileys';

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Prompt for allowFrom whitelist. Empty input = accept all. */
async function promptAllowFrom(label: string, example: string): Promise<string[]> {
  console.log(`  Allowed ${label} (comma-separated, empty = accept all):`);
  console.log(chalk.gray(`    Example: ${example}`));
  const input = await prompt('    > ');
  if (!input) return [];
  return input.split(',').map((s) => s.trim()).filter(Boolean);
}

async function setupWhatsApp(): Promise<void> {
  console.log('');
  console.log(chalk.blue('WhatsApp Setup'));
  console.log(chalk.gray('─────────────────────'));
  console.log('');

  // Clear stale auth state so a fresh QR is generated
  const authDir = path.join(resolveChannelsDir(), 'whatsapp');
  try {
    await fs.rm(authDir, { recursive: true, force: true });
  } catch { /* ignore */ }

  console.log('Connecting to WhatsApp...');
  console.log('Scan the QR code below with WhatsApp > Linked Devices:');
  console.log('');

  let connected = false;
  let connectedName = '';
  let needsRestart = false;

  const MAX_RESTARTS = 3;
  let restarts = 0;
  // Track sock in a mutable container so TS doesn't narrow it to never
  const state: { sock: WASocket | null } = { sock: null };

  const connect = async () => {
    state.sock = await createWhatsAppSocket(authDir, {
      onQR: () => { /* qrcode-terminal already prints it */ },
      onConnected: (name) => {
        connected = true;
        connectedName = name;
      },
      onDisconnected: (reason) => {
        if (connected) return;
        if (reason === 'restart_required' && restarts < MAX_RESTARTS) {
          needsRestart = true;
          console.log(chalk.yellow('  Restart required — reconnecting...'));
        } else {
          console.log(chalk.yellow(`  Connection issue: ${reason}`));
        }
      },
      onMessage: () => { /* ignore during onboard */ },
    });
  };

  try {
    await connect();

    // Wait for connection (up to 90s), handle restart_required by retrying
    const deadline = Date.now() + 90_000;
    while (!connected && Date.now() < deadline) {
      if (needsRestart) {
        needsRestart = false;
        restarts++;
        try { state.sock?.end(undefined); } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 1000));
        await connect();
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (connected) {
      console.log('');
      console.log(chalk.green(`Connected as ${connectedName}`));
      console.log('');

      const allowFrom = await promptAllowFrom('phone numbers', '+1234567890');
      const config: ChannelConfig = { type: 'whatsapp', enabled: true, allowFrom };
      await addChannelConfig(config);
      console.log(chalk.green(`Saved to ${resolveDataDir()}/config.json`));
    } else {
      console.log('');
      console.log(chalk.red('Connection timed out. Try again with: vargos config channel edit'));
    }

    try { state.sock?.end(undefined); } catch { /* ignore */ }
  } catch (err) {
    console.error(chalk.red(`Setup failed: ${err instanceof Error ? err.message : String(err)}`));
  }
}

async function setupTelegram(): Promise<void> {
  console.log('');
  console.log(chalk.blue('Telegram Setup'));
  console.log(chalk.gray('─────────────────────'));
  console.log('');
  console.log('1. Open @BotFather on Telegram');
  console.log('2. Send /newbot and follow the prompts');
  console.log('3. Copy the bot token');
  console.log('');

  const token = await prompt('  Bot token: ');
  if (!token) {
    console.log(chalk.yellow('  Skipped'));
    return;
  }

  // Only validate the token via getMe — don't start polling
  const adapter = new TelegramAdapter(token);

  try {
    await adapter.initialize();
    console.log('');
    console.log(chalk.green('Telegram bot verified'));
    console.log('');

    const allowFrom = await promptAllowFrom('chat IDs', '12345678');
    const config: ChannelConfig = { type: 'telegram', enabled: true, botToken: token, allowFrom };
    await addChannelConfig(config);
    console.log(chalk.green(`Saved to ${resolveDataDir()}/config.json`));
  } catch (err) {
    console.error(chalk.red(`Validation failed: ${err instanceof Error ? err.message : String(err)}`));
    console.log(chalk.gray('Check your bot token and try again.'));
  }
}

async function viewChannels(): Promise<void> {
  const channels = await loadChannelConfigs();
  console.log('');
  if (channels.length === 0) {
    console.log(chalk.gray('  No channels configured'));
  } else {
    for (const ch of channels) {
      const status = ch.enabled ? chalk.green('enabled') : chalk.gray('disabled');
      const parts = [status];
      if (ch.type === 'telegram' && ch.botToken) {
        parts.push(`token: ...${String(ch.botToken).slice(-6)}`);
      }
      if (ch.allowFrom?.length) {
        parts.push(`allow: ${ch.allowFrom.join(', ')}`);
      } else {
        parts.push('allow: all');
      }
      console.log(`  ${ch.type}: ${parts.join(' | ')}`);
    }
  }
  console.log('');
}

export async function runOnboarding(): Promise<void> {
  console.log('');
  console.log(chalk.blue.bold('Vargos Channel Setup'));
  console.log(chalk.gray('─────────────────────'));
  console.log('');
  console.log('  1. WhatsApp (scan QR code)');
  console.log('  2. Telegram (paste bot token)');
  console.log('  3. View configured channels');
  console.log('');

  const choice = await prompt('  > ');

  switch (choice) {
    case '1':
      await setupWhatsApp();
      break;
    case '2':
      await setupTelegram();
      break;
    case '3':
      await viewChannels();
      break;
    default:
      console.log(chalk.yellow('  Invalid choice'));
  }

  console.log('');
  console.log(chalk.gray('Start receiving messages:'));
  console.log(chalk.gray('  vargos gateway start'));
  console.log('');
}
