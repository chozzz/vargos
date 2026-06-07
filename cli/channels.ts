/**
 * Channel management — shared CRUD used by onboard wizard and vargos channels CLI.
 *
 * Exports:
 *   listChannels()        → array of { id, type, botToken? }
 *   registerChannel()     → upsert into config.json (returns whether it was newly created)
 *   deregisterChannel()   → remove from config.json
 *   pairWhatsApp()        → standalone QR pairing (stops after connected)
 *   sendChannelMessage()  → deliver a message via the running gateway (channel.send)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import { getDataPaths } from '../lib/paths.js';
import type { ChannelEntry } from '../services/config/schemas/channels.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChannelInfo {
  id: string;
  type: ChannelEntry['type'];
  botToken?: string;
  enabled?: boolean;
  registered?: boolean; // WhatsApp: has creds.json (paired)
}

export interface RegisterChannelParams {
  id: string;
  type: ChannelEntry['type'];
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

/**
 * Upsert a channel into config.json. Idempotent: re-registering an existing id
 * leaves it in place (refreshing the bot token if a new one is supplied) so that
 * `register whatsapp <id>` can mean "ensure set up, then (re)pair".
 * Returns whether the entry was newly created.
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

  const entry: Record<string, unknown> = {
    id: params.id,
    type: params.type,
    enabled: true,
  };
  if (params.botToken) entry['botToken'] = params.botToken;

  channels.push(entry);
  config.channels = channels;
  writeConfig(config);
  return { created: true };
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
    }).then(() => {
      // Socket created, wait for onConnected to resolve
      // If the process exits before onConnected, the promise rejects via onDisconnected
    }).catch(reject);
  });
}

// ── Gateway client (talks to a running `vargos start`) ─────────────────────────

/** Resolve the gateway address from config.json, mirroring boot.ts defaults. */
function gatewayAddress(): { host: string; port: number } {
  const gw = (readConfig().gateway ?? {}) as { host?: string; port?: number };
  const host = gw.host ?? process.env.BUS_HOST ?? '127.0.0.1';
  const port = gw.port ?? (process.env.BUS_PORT ? parseInt(process.env.BUS_PORT, 10) : 9000);
  return { host, port };
}

/** Send one JSON-RPC request to the gateway and resolve with its result. */
function gatewayCall<T>(method: string, params: unknown): Promise<T> {
  const { host, port } = gatewayAddress();
  return new Promise<T>((resolve, reject) => {
    const socket = createConnection({ host, port }, () => {
      socket.write(JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }) + '\n');
    });

    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const nl = buffer.indexOf('\n');
      if (nl === -1) return; // wait for the full line
      socket.end();
      try {
        const res = JSON.parse(buffer.slice(0, nl)) as { result?: T; error?: { message?: string } };
        if (res.error) reject(new Error(res.error.message ?? 'gateway error'));
        else resolve(res.result as T);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

    socket.setTimeout(10_000, () => {
      socket.destroy();
      reject(new Error(`gateway not reachable at ${host}:${port} — is "vargos start" running?`));
    });
    socket.on('error', (err) => reject(
      new Error(`gateway not reachable at ${host}:${port} — is "vargos start" running? (${err.message})`),
    ));
  });
}

/** Deliver a message to a channel session via the running gateway. */
export async function sendChannelMessage(sessionKey: string, text: string): Promise<boolean> {
  const result = await gatewayCall<{ sent?: boolean }>('channel.send', { sessionKey, text });
  return result?.sent === true;
}
