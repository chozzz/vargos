/**
 * Channel setup helpers for first-run enrichment / `vargos config`. Writes config.json directly because
 * onboarding runs before any daemon exists. Live channel ops go through the bus
 * (`vargos channel …` / RpcClient), not here.
 */

import path from 'node:path';
import qrcode from 'qrcode-terminal';
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
    let settled = false;
    let connected = false;
    let qrShown = false;
    let restarts = 0;

    const connect = async (): Promise<void> => {
      await createWhatsAppSocket(authDir, {
        onQR: (qr) => {
          if (qrShown) {
            // Baileys rotated the QR — the previous one expired before it was scanned.
            // Exit cleanly so the user can re-run and get a fresh code immediately.
            if (!settled) {
              settled = true;
              reject(new Error('QR code expired before scan. Re-run the command to get a fresh QR.'));
            }
            return;
          }
          qrShown = true;
          qrcode.generate(qr, { small: true });
          console.log('\n  Scan the QR above with WhatsApp → Linked Devices.\n');
        },
        onConnected: (name) => {
          if (settled) return;
          connected = true;
          console.log(`\n✅ Connected as ${name}`);
          console.log(`   Saving credentials…`);
          // Do not resolve here — wait for onCredsSaved to confirm the disk write completed.
          // Resolving at connection.open risks process.exit() truncating the creds.json write.
        },
        onCredsSaved: () => {
          if (!connected || settled) return;
          settled = true;
          console.log(`   Credentials saved to ${authDir}/creds.json\n`);
          resolve();
        },
        onDisconnected: (reason) => {
          if (settled) return;
          // Baileys closes with restart_required immediately after a successful scan — the
          // creds are saved, but login only completes after reconnecting. This is normal.
          if (reason === 'restart_required' && restarts++ < 5) {
            console.log('  Scan accepted — finishing login…');
            connect().catch(err => { if (!settled) { settled = true; reject(err); } });
            return;
          }
          settled = true;
          if (reason === 'logged_out') reject(new Error('Pairing failed — device logged out. Try again.'));
          else if (reason === 'forbidden') reject(new Error('Pairing failed — access forbidden.'));
          else reject(new Error(`Pairing failed — connection closed (${reason}). Re-run with --reset to retry.`));
        },
        onMessage: () => {},
      });
    };

    connect().catch(reject);
  });
}
