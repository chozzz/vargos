import { createConnection } from 'node:net';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EmitterBus } from '../bus.js';
import { startRpcServer } from '../rpc-server.js';
import { z } from 'zod';

const TEST_HOST = '127.0.0.1';
const TEST_PORT = 19099;

function rpcConnect(port: number, requestData: string, opts?: { halfClose?: boolean }): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: TEST_HOST, port }, () => {
      socket.write(requestData);
      if (opts?.halfClose) {
        // Mimic `nc -N`: send FIN (half-close write side) but keep reading.
        // This is what macOS nc, GNU nc, and `nc -N` do after stdin EOF.
        socket.end();
      }
    });

    let response = '';
    socket.on('data', (chunk) => { response += chunk.toString(); });
    socket.on('error', reject);
    socket.on('close', () => resolve(response.trim()));
  });
}

describe('rpc-server', () => {
  let bus: EmitterBus;
  let stop: (() => Promise<void>) | null = null;

  beforeEach(async () => {
    bus = new EmitterBus();
    bus.register('test.echo', {
      description: 'Echo back the params',
      schema: z.object({ msg: z.string() }),
    }, async (p: { msg: string }) => ({ echoed: p.msg }));

    bus.register('test.slow', {
      description: 'Delayed response simulating agent.execute',
      schema: z.object({ delayMs: z.number().optional() }),
    }, async (p: { delayMs?: number }) => {
      await new Promise((r) => setTimeout(r, p.delayMs ?? 100));
      return { ok: true };
    });
  });

  afterEach(async () => {
    if (stop) await stop();
    stop = null;
  });

  async function boot(port = TEST_PORT): Promise<void> {
    stop = await startRpcServer(bus, TEST_HOST, port, 60_000);
  }

  it('responds to a fast call', async () => {
    await boot();
    const res = await rpcConnect(TEST_PORT, '{"jsonrpc":"2.0","method":"test.echo","params":{"msg":"hello"},"id":1}\n');
    expect(JSON.parse(res)).toEqual({ jsonrpc: '2.0', result: { echoed: 'hello' }, id: 1 });
  });

  it('responds to a slow call (agent.execute-like)', async () => {
    await boot();
    const res = await rpcConnect(
      TEST_PORT,
      '{"jsonrpc":"2.0","method":"test.slow","params":{"delayMs":200},"id":2}\n',
    );
    expect(JSON.parse(res)).toEqual({ jsonrpc: '2.0', result: { ok: true }, id: 2 });
  });

  it('responds even when client half-closes (FIN before response)', async () => {
    // This is the nc-exits-without-reply bug scenario:
    // `echo '{"jsonrpc":"2.0","method":"test.slow","params":{"delayMs":200},"id":3}' | nc -N localhost 9000`
    // nc sends FIN after writing the request (stdin EOF → -N flag or macOS/GNU nc).
    // With allowHalfOpen=false (the old default), Node auto-calls socket.end() on
    // receiving the client FIN, making the socket unwritable — the response is lost.
    // With allowHalfOpen=true (the fix), the server stays writable and replies.
    await boot();
    const res = await rpcConnect(
      TEST_PORT,
      '{"jsonrpc":"2.0","method":"test.slow","params":{"delayMs":200},"id":3}\n',
      { halfClose: true },
    );
    expect(JSON.parse(res)).toEqual({ jsonrpc: '2.0', result: { ok: true }, id: 3 });
  });

  it('responds to a fast call with client half-close', async () => {
    await boot();
    const res = await rpcConnect(
      TEST_PORT,
      '{"jsonrpc":"2.0","method":"test.echo","params":{"msg":"fin"},"id":4}\n',
      { halfClose: true },
    );
    expect(JSON.parse(res)).toEqual({ jsonrpc: '2.0', result: { echoed: 'fin' }, id: 4 });
  });

  it('returns JSON-RPC error for unknown method', async () => {
    await boot();
    const res = await rpcConnect(
      TEST_PORT,
      '{"jsonrpc":"2.0","method":"no.such.method","params":{},"id":5}\n',
    );
    const parsed = JSON.parse(res);
    expect(parsed.error.code).toBe(-32601);
    expect(parsed.id).toBe(5);
  });

  it('returns parse error for invalid JSON', async () => {
    await boot();
    const res = await rpcConnect(TEST_PORT, 'not json\n');
    const parsed = JSON.parse(res);
    expect(parsed.error.code).toBe(-32700);
  });

  it('closes cleanly when client half-closes with no pending request', async () => {
    await boot();
    // Client connects, sends FIN immediately, no request → server's 'end' handler
    // should close its side too.
    const res = await rpcConnect(TEST_PORT, '', { halfClose: true });
    expect(res).toBe('');
  });
});
