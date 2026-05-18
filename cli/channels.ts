/**
 * Channel management — shared CRUD used by onboard wizard and vargos channels CLI.
 *
 * Exports:
 *   listChannels()        → array of { id, type, botToken? }
 *   registerChannel()     → add to config.json
 *   deregisterChannel()   → remove from config.json
 *   pairWhatsApp()        → standalone QR pairing (stops after connected)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDataPaths } from '../lib/paths.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChannelInfo {
  id: string;
  type: 'telegram' | 'whatsapp';
  botToken?: string;
  enabled?: boolean;
  registered?: boolean; // WhatsApp: has creds.json (paired)
}

export interface RegisterChannelParams {
  id: string;
  type: 'telegram' | 'whatsapp';
  botToken?: string; // Telegram only
}

// ── Config read/write ────────────────────────────────────────────────────────

interface ConfigFile {
  channels?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

function readConfig(): ConfigFile {
  const { configFile } = getDataPaths();
  if (!existsSync(configFile)) return {};
  try {
    return JSON.parse(readFileSync(configFile, 'utf-8')) as ConfigFile;
  } catch {
    return {};
  }
}

function writeConfig(config: ConfigFile): void {
  const { configFile } = getDataPaths();
  if (!existsSync(path.dirname(configFile))) {
    mkdirSync(path.dirname(configFile), { recursive: true });
  }
  writeFileSync(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function listChannels(): ChannelInfo[] {
  const config = readConfig();
  const channels = (config.channels ?? []) as Array<Record<string, unknown>>;
  return channels.map((ch) => {
    const info: ChannelInfo = {
      id: String(ch.id ?? ''),
      type: (ch.type as ChannelInfo['type']) ?? 'whatsapp',
      enabled: ch.enabled !== false,
    };
    if (ch.botToken != null) info['botToken'] = String(ch.botToken);

    // WhatsApp: check if paired (creds.json exists)
    if (info.type === 'whatsapp') {
      const authDir = path.join(getDataPaths().channelsDir, info.id);
      info.registered = existsSync(path.join(authDir, 'creds.json'));
    }

    return info;
  });
}

export function registerChannel(params: RegisterChannelParams): void {
  const config = readConfig();
  const channels = (config.channels ?? []) as Array<Record<string, unknown>>;

  // Check for duplicate id
  if (channels.some((c) => c.id === params.id)) {
    throw new Error(`Channel "${params.id}" already exists. Use deregister first.`);
  }

  const entry: Record<string, unknown> = {
    id: params.id,
    type: params.type,
    enabled: true,
  };
  if (params.botToken) entry['botToken'] = params.botToken;

  channels.push(entry);
  config.channels = channels;
  writeConfig(config);
}

export function deregisterChannel(id: string): void {
  const config = readConfig();
  const channels = (config.channels ?? []) as Array<Record<string, unknown>>;
  const idx = channels.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`Channel "${id}" not found.`);
  channels.splice(idx, 1);
  config.channels = channels;
  writeConfig(config);
}

// ── WhatsApp standalone pairing ───────────────────────────────────────────────

export async function pairWhatsApp(id: string): Promise<void> {
  const authDir = path.join(getDataPaths().channelsDir, id);

  // Dynamic import — only loads Baileys when this function is called
  const { createWhatsAppSocket } = await import(
    '../services/channels/providers/whatsapp/session.js'
  );

  return new Promise<void>((resolve, reject) => {
    createWhatsAppSocket(authDir, {
      onQR: () => {
        // QR printed automatically by qrcode-terminal inside session.ts
      },
      onConnected: (name) => {
        console.log(`\n✅ Connected as ${name}`);
        console.log(`   Credentials saved to ${authDir}/creds.json\n`);
        resolve();
      },
      onDisconnected: (reason) => {
        if (reason === 'logged_out') {
          reject(new Error('Pairing failed — device logged out. Try again.'));
        } else if (reason === 'forbidden') {
          reject(new Error('Pairing failed — access forbidden.'));
        } else {
          // Connection closed for other reasons — may still have succeeded
          console.log(`\n⚠ Connection closed (${reason}). If you scanned the QR, pairing may have succeeded.`);
          resolve();
        }
      },
      onMessage: () => {
        // Ignore messages during pairing
      },
    }).then((sock) => {
      // Socket created, wait for onConnected to resolve
      // If the process exits before onConnected, the promise rejects via onDisconnected
    }).catch(reject);
  });
}
