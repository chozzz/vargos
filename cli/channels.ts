/**
 * Channel setup helpers for the onboard wizard. Writes config.json directly because
 * onboarding runs before any daemon exists. Live channel ops go through the bus
 * (`vargos channel …` / RpcClient), not here.
 */

import path from 'node:path';
import { getDataPaths } from '../lib/paths.js';
import { readJson, writeJson } from '../lib/util.js';
import type { ChannelEntry } from '../services/config/schemas/channels.js';

export interface RegisterChannelParams {
  id: string;
  type: ChannelEntry['type'];
  botToken?: string; // Telegram only
}

interface ConfigFile {
  channels?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

function readConfig(): ConfigFile {
  const { configFile } = getDataPaths();
  return readJson<ConfigFile>(configFile) ?? {};
}

function writeConfig(config: ConfigFile): void {
  writeJson(getDataPaths().configFile, config);
}

/**
 * Upsert a channel into config.json. Idempotent: re-registering an existing id leaves
 * it in place (refreshing the bot token if supplied). Returns whether it was created.
 */
export function registerChannel(params: RegisterChannelParams): { created: boolean } {
  const config = readConfig();
  const channels = (config.channels ?? []) as Array<Record<string, unknown>>;

  const existing = channels.find((c) => c.id === params.id);
  if (existing) {
    if (params.botToken) existing['botToken'] = params.botToken;
    config.channels = channels;
    writeConfig(config);
    return { created: false };
  }

  const entry: Record<string, unknown> = { id: params.id, type: params.type, enabled: true };
  if (params.botToken) entry['botToken'] = params.botToken;
  channels.push(entry);
  config.channels = channels;
  writeConfig(config);
  return { created: true };
}

/** Standalone WhatsApp QR pairing (loads Baileys only when called). */
export async function pairWhatsApp(id: string): Promise<void> {
  const authDir = path.join(getDataPaths().channelsDir, id);
  const { createWhatsAppSocket } = await import('../services/channel/providers/whatsapp/session.js');

  return new Promise<void>((resolve, reject) => {
    createWhatsAppSocket(authDir, {
      onQR: () => {},
      onConnected: (name) => {
        console.log(`\n✅ Connected as ${name}`);
        console.log(`   Credentials saved to ${authDir}/creds.json\n`);
        resolve();
      },
      onDisconnected: (reason) => {
        if (reason === 'logged_out') reject(new Error('Pairing failed — device logged out. Try again.'));
        else if (reason === 'forbidden') reject(new Error('Pairing failed — access forbidden.'));
        else {
          console.log(`\n⚠ Connection closed (${reason}). If you scanned the QR, pairing may have succeeded.`);
          resolve();
        }
      },
      onMessage: () => {},
    }).catch(reject);
  });
}
