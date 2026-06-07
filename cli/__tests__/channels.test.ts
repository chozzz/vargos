/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import * as path from 'node:path';
import * as os from 'node:os';
import { resetDataPaths } from '../../lib/paths.js';
import { registerChannel, listChannels, deregisterChannel, sendChannelMessage } from '../channels.js';

function writeConfig(dataDir: string, config: Record<string, unknown>) {
  writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify(config, null, 2));
}
function readConfig(dataDir: string) {
  return JSON.parse(readFileSync(path.join(dataDir, 'config.json'), 'utf-8'));
}

/** A throwaway gateway that answers one JSON-RPC line, then echoes via `respond`. */
function fakeGateway(respond: (req: { method: string; params: any }) => unknown): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server: Server = createServer((socket) => {
      let buf = '';
      socket.on('data', (d) => {
        buf += d.toString();
        const nl = buf.indexOf('\n');
        if (nl === -1) return;
        const req = JSON.parse(buf.slice(0, nl));
        socket.write(JSON.stringify({ jsonrpc: '2.0', ...(respond(req) as object), id: req.id }) + '\n');
        socket.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ port, close: () => server.close() });
    });
  });
}

describe('registerChannel (idempotent upsert)', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `cli-channels-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    originalEnv = process.env.VARGOS_DATA_DIR;
    process.env.VARGOS_DATA_DIR = tmpDir;
    resetDataPaths();
    writeConfig(tmpDir, {});
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.VARGOS_DATA_DIR;
    else process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a new channel and reports created: true', () => {
    expect(registerChannel({ id: 'tg1', type: 'telegram', botToken: 'AAA' })).toEqual({ created: true });
    expect(listChannels().map(c => c.id)).toEqual(['tg1']);
  });

  it('is idempotent — re-registering the same id reports created: false', () => {
    registerChannel({ id: 'wa1', type: 'whatsapp' });
    expect(registerChannel({ id: 'wa1', type: 'whatsapp' })).toEqual({ created: false });
    // Still a single entry — no duplicate.
    expect(listChannels().filter(c => c.id === 'wa1')).toHaveLength(1);
  });

  it('refreshes the bot token when re-registering with a new one', () => {
    registerChannel({ id: 'tg1', type: 'telegram', botToken: 'OLD' });
    registerChannel({ id: 'tg1', type: 'telegram', botToken: 'NEW' });
    const entry = readConfig(tmpDir).channels.find((c: { id: string }) => c.id === 'tg1');
    expect(entry.botToken).toBe('NEW');
  });

  it('deregister removes the entry', () => {
    registerChannel({ id: 'tg1', type: 'telegram', botToken: 'AAA' });
    deregisterChannel('tg1');
    expect(listChannels()).toHaveLength(0);
  });
});

describe('sendChannelMessage (gateway client)', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;
  let gateway: { port: number; close: () => void } | undefined;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `cli-send-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    originalEnv = process.env.VARGOS_DATA_DIR;
    process.env.VARGOS_DATA_DIR = tmpDir;
    resetDataPaths();
  });

  afterEach(() => {
    gateway?.close();
    if (originalEnv === undefined) delete process.env.VARGOS_DATA_DIR;
    else process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sends channel.send and returns true on { sent: true }', async () => {
    let received: { method: string; params: any } | undefined;
    gateway = await fakeGateway((req) => { received = req; return { result: { sent: true } }; });
    writeConfig(tmpDir, { gateway: { host: '127.0.0.1', port: gateway.port } });

    const sent = await sendChannelMessage('telegram-bot:42', 'hi there');

    expect(sent).toBe(true);
    expect(received?.method).toBe('channel.send');
    expect(received?.params).toEqual({ sessionKey: 'telegram-bot:42', text: 'hi there' });
  });

  it('returns false when the gateway reports { sent: false }', async () => {
    gateway = await fakeGateway(() => ({ result: { sent: false } }));
    writeConfig(tmpDir, { gateway: { host: '127.0.0.1', port: gateway.port } });

    expect(await sendChannelMessage('telegram-bot:42', 'hi')).toBe(false);
  });

  it('rejects with the gateway error message', async () => {
    gateway = await fakeGateway(() => ({ error: { code: -32603, message: 'No adapter for channel: x' } }));
    writeConfig(tmpDir, { gateway: { host: '127.0.0.1', port: gateway.port } });

    await expect(sendChannelMessage('x:1', 'hi')).rejects.toThrow('No adapter for channel: x');
  });

  it('rejects with a helpful message when the gateway is unreachable', async () => {
    writeConfig(tmpDir, { gateway: { host: '127.0.0.1', port: 59999 } });
    await expect(sendChannelMessage('x:1', 'hi')).rejects.toThrow(/not reachable/);
  });
});
