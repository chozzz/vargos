/**
 * Channel setup flows for WhatsApp and Telegram
 * Used by first-run wizard and `vargos config channel edit`
 */

import { text, confirm, log, isCancel } from '@clack/prompts';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadChannelConfigs, addChannelConfig } from './config.js';
import { resolveChannelsDir, resolveDataDir } from '../config/paths.js';
import { createWhatsAppSocket } from '../../extensions/channel-whatsapp/session.js';
import { TelegramAdapter } from '../../extensions/channel-telegram/adapter.js';
import type { ChannelConfig } from './types.js';
import type { WASocket } from '@whiskeysockets/baileys';

async function promptAllowFrom(label: string, example: string): Promise<string[]> {
  const input = await text({
    message: `Allowed ${label} (comma-separated, empty = accept all)`,
    placeholder: example,
  });
  if (isCancel(input)) return [];
  if (!input) return [];
  return input.split(',').map((s) => s.trim()).filter(Boolean);
}

export async function setupWhatsApp(): Promise<void> {
  log.info('WhatsApp Setup');

  // Clear stale auth state so a fresh QR is generated
  const authDir = path.join(resolveChannelsDir(), 'whatsapp');
  try {
    await fs.rm(authDir, { recursive: true, force: true });
  } catch { /* ignore */ }

  log.step('Connecting to WhatsApp...');
  log.step('Scan the QR code below with WhatsApp > Linked Devices:');

  let connected = false;
  let connectedName = '';
  let needsRestart = false;

  const MAX_RESTARTS = 3;
  let restarts = 0;
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
          log.warn('Restart required — reconnecting...');
        } else {
          log.warn(`Connection issue: ${reason}`);
        }
      },
      onMessage: () => { /* ignore during onboard */ },
    });
  };

  try {
    await connect();

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
      log.success(`Connected as ${connectedName}`);

      const allowFrom = await promptAllowFrom('phone numbers', '+1234567890');
      const config: ChannelConfig = { type: 'whatsapp', enabled: true, allowFrom };
      await addChannelConfig(config);
      log.success(`Saved to ${resolveDataDir()}/config.json`);
    } else {
      log.error('Connection timed out. Try again with: vargos config channel edit');
    }

    try { state.sock?.end(undefined); } catch { /* ignore */ }
  } catch (err) {
    log.error(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function setupTelegram(): Promise<void> {
  log.info('Telegram Setup');
  log.step('1. Open @BotFather on Telegram');
  log.step('2. Send /newbot and follow the prompts');
  log.step('3. Copy the bot token');

  const token = await text({ message: 'Bot token', placeholder: '123456:ABC-...' });
  if (isCancel(token) || !token) {
    log.warn('Skipped');
    return;
  }

  const adapter = new TelegramAdapter(token);

  try {
    await adapter.initialize();
    log.success('Telegram bot verified');

    const allowFrom = await promptAllowFrom('chat IDs', '12345678');
    const config: ChannelConfig = { type: 'telegram', enabled: true, botToken: token, allowFrom };
    await addChannelConfig(config);
    log.success(`Saved to ${resolveDataDir()}/config.json`);
  } catch (err) {
    log.error(`Validation failed: ${err instanceof Error ? err.message : String(err)}`);
    log.warn('Check your bot token and try again.');
  }
}

export async function viewChannels(): Promise<void> {
  const channels = await loadChannelConfigs();

  if (channels.length === 0) {
    log.info('No channels configured');
    return;
  }

  for (const ch of channels) {
    const status = ch.enabled ? 'enabled' : 'disabled';
    const parts = [status];
    if (ch.type === 'telegram' && ch.botToken) {
      parts.push(`token: ...${String(ch.botToken).slice(-6)}`);
    }
    if (ch.allowFrom?.length) {
      parts.push(`allow: ${ch.allowFrom.join(', ')}`);
    } else {
      parts.push('allow: all');
    }
    log.info(`${ch.type}: ${parts.join(' | ')}`);
  }
}
