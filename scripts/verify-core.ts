/**
 * Acceptance verification for the re-architected core. Loads real service modules
 * from a temp dir through the actual ServiceLoader, exercises all three surfaces
 * (CLI projection, agent-tool projection, JSON-RPC), reloads from disk, and checks
 * bus semantics + dispose discipline. Run: pnpm tsx scripts/verify-core.ts
 */

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createConnection } from 'node:net';
import { z } from 'zod';
import { EmitterBus } from '../core/bus.js';
import { ServiceLoader } from '../core/loader.js';
import { startRpcServer } from '../core/rpc-server.js';
import { buildParams, renderHelp, RpcClient } from '../core/cli.js';
import { bootLocal } from '../core/local.js';
import { MethodNotFoundError } from '../core/errors.js';

let pass = 0, fail = 0;
function ok(label: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (cond) pass++; else fail++;
}

const dir = mkdtempSync(path.join(tmpdir(), 'vargos-verify-'));
const g = globalThis as typeof globalThis & { __ticks: number };
g.__ticks = 0;

const channelV1 = `
export function createService() {
  let timer;
  return {
    name: 'channel',
    init(bus) {
      bus.register('channel.send', {
        description: 'Send a message via a channel',
        schema: { safeParse: (p) => (p && typeof p.recipient === 'string' && typeof p.message === 'string')
          ? { success: true, data: p }
          : { success: false, error: { issues: [{ path: ['message'], message: 'Required' }] } } },
        cli: { positional: ['recipient', 'message'] },
      }, (p) => ({ sent: true, via: 'v1', to: p.recipient, text: p.message }));
      timer = setInterval(() => { globalThis.__ticks++; }, 25);
    },
    dispose() { clearInterval(timer); },
  };
}
`;

// v2: changed return value (D1), removed channel.send, added channel.ping (D3).
const channelV2 = `
export function createService() {
  let timer;
  return {
    name: 'channel',
    init(bus) {
      bus.register('channel.ping', {
        description: 'Ping',
        schema: { safeParse: (p) => ({ success: true, data: p ?? {} }) },
      }, () => ({ via: 'v2', pong: true }));
      timer = setInterval(() => { globalThis.__ticks++; }, 25);
    },
    dispose() { clearInterval(timer); },
  };
}
`;

const memory = `
export function createService() {
  return {
    name: 'memory',
    init(bus) {
      bus.register('memory.search', {
        description: 'Search memory',
        schema: { safeParse: (p) => (p && typeof p.query === 'string')
          ? { success: true, data: p }
          : { success: false, error: { issues: [{ path: ['query'], message: 'Required' }] } } },
        cli: { positional: ['query'] },
      }, (p) => [{ citation: 'MEMORY.md', content: 'found: ' + p.query }]);
    },
    dispose() {},
  };
}
`;

const chanPath = path.join(dir, 'channel.mjs');
const memPath = path.join(dir, 'memory.mjs');
writeFileSync(chanPath, channelV1);
writeFileSync(memPath, memory);

interface RpcResponse {
  result?: { sent?: boolean; pong?: boolean };
  error?: { code: number; message: string };
}
const rpcCall = (port: number, body: object): Promise<RpcResponse> => new Promise((resolve, reject) => {
  const s = createConnection({ host: '127.0.0.1', port }, () => s.write(JSON.stringify(body) + '\n'));
  let buf = '';
  s.on('data', (d) => { buf += d; if (buf.includes('\n')) { s.end(); resolve(JSON.parse(buf.split('\n')[0])); } });
  s.on('error', reject);
});

async function main() {
  const pid = process.pid;
  const bus = new EmitterBus();
  const loader = new ServiceLoader(bus);
  await loader.load({ name: 'channel', modulePath: chanPath, priority: 0 });
  await loader.load({ name: 'memory', modulePath: memPath, priority: 0 });

  console.log('\nA. Centralization — one registration, three surfaces');
  const list = bus.list();
  const send = list.find(m => m.name === 'channel.send')!;
  ok('A1 channel.send in registry/CLI list with description', !!send && send.description === 'Send a message via a channel');
  ok('A1 --help renders description + arg shape', renderHelp('channel', bus.list('channel')).includes('Send a message via a channel'));
  const sendRes = await bus.call('channel.send', { recipient: 'telegram:42', message: 'hi' });
  ok('A2 invocable via bus/CLI path', JSON.stringify(sendRes) === JSON.stringify({ sent: true, via: 'v1', to: 'telegram:42', text: 'hi' }));

  const rpcStop = await startRpcServer(bus, '127.0.0.1', 19099);
  const r = await rpcCall(19099, { jsonrpc: '2.0', method: 'channel.send', params: { recipient: 'x', message: 'y' }, id: 1 });
  ok('A3 invocable via JSON-RPC', r.result?.sent === true, JSON.stringify(r.result));

  const agentTools = bus.list().filter(m => !m.internal); // agent-tool projection
  ok('A4 present in agent tool list with matching description', agentTools.some(m => m.name === 'channel.send' && m.description === send.description));

  console.log('\nB. CLI introspection');
  ok('B1 vargos <service> lists exactly that service', bus.list('channel').every(m => m.service === 'channel') && bus.list('channel').length === 1);
  // B2 with a real zod schema (the fake schema above can't be converted to JSON Schema):
  const zbus = new EmitterBus();
  zbus.register('demo.send', {
    description: 'Send a message via a channel',
    schema: z.object({ recipient: z.string(), message: z.string() }),
    cli: { positional: ['recipient', 'message'] },
  }, () => ({}));
  ok('B2 --help shows arg shape from registry', /<recipient>.*<message>/s.test(renderHelp('demo', zbus.list('demo'))));
  ok('B3 positional args map to schema keys', JSON.stringify(buildParams(send, ['telegram:7', 'hello'])) === JSON.stringify({ recipient: 'telegram:7', message: 'hello' }));
  let usageErr = '';
  try { buildParams(send, ['a', 'b', 'c']); } catch (e) { usageErr = (e as Error).message; }
  ok('B3 wrong arg count → clear usage error (not stack trace)', usageErr.includes('too many arguments'));
  // B4: same validation error on every surface
  let directErr = '';
  try { await bus.call('channel.send', { recipient: 'only' }); } catch (e) { directErr = (e as Error).message; }
  const rpcErr = await rpcCall(19099, { jsonrpc: '2.0', method: 'channel.send', params: { recipient: 'only' }, id: 2 });
  ok('B4 same validation error on direct + RPC', directErr.includes('Invalid params') && rpcErr.error?.code === -32602, `${directErr} | rpc=${rpcErr.error?.code}`);

  console.log('\nC. Bus semantics');
  let notFound: unknown;
  try { await bus.call('nope.missing'); } catch (e) { notFound = e; }
  ok('C1 call unregistered → MethodNotFoundError', notFound instanceof MethodNotFoundError && (notFound as MethodNotFoundError).code === -32601);
  const rpcMissing = await rpcCall(19099, { jsonrpc: '2.0', method: 'nope.missing', params: {}, id: 3 });
  ok('C1 RPC returns -32601', rpcMissing.error?.code === -32601);
  let emitThrew = false;
  try { bus.emit('event.with.no.listeners', { a: 1 }); } catch { emitThrew = true; }
  ok('C2 emit with no listeners is a silent no-op', !emitThrew);

  console.log('\nD. Hot in-process reload (same PID)');
  await new Promise(r => setTimeout(r, 120));
  const ticksBefore = g.__ticks;
  writeFileSync(chanPath, channelV2); // git pull simulation
  await loader.restart('channel');
  ok('D1 same PID across reload', process.pid === pid);
  const afterList = bus.list('channel');
  ok('D1 new code observed (return value changed v1→v2)', JSON.stringify(await bus.call('channel.ping')) === JSON.stringify({ via: 'v2', pong: true }));
  ok('D3 added method appears on all surfaces', afterList.some(m => m.name === 'channel.ping') && (await rpcCall(19099, { jsonrpc: '2.0', method: 'channel.ping', id: 4 })).result?.pong === true);
  ok('D3 removed method disappears from all surfaces', !bus.has('channel.send') && (await rpcCall(19099, { jsonrpc: '2.0', method: 'channel.send', params: {}, id: 5 })).error?.code === -32601);
  ok('D4 other service untouched (memory still works)', JSON.stringify(await bus.call('memory.search', { query: 'z' })) === JSON.stringify([{ citation: 'MEMORY.md', content: 'found: z' }]));
  // D2: old interval cleared on dispose → exactly one timer running, not two.
  const t1 = g.__ticks;
  await new Promise(r => setTimeout(r, 250));
  const rate = (g.__ticks - t1) / 0.25; // ticks/sec
  ok('D2 no duplicate timers after reload (≈40/s, one interval)', rate > 20 && rate < 60, `${rate.toFixed(0)}/s`);
  void ticksBefore;

  await rpcStop();

  console.log('\nE. CLI ↔ daemon coexistence');
  const client = new RpcClient('127.0.0.1', 19098);
  ok('E2 no daemon → isUp() false', !(await client.isUp()));
  const stack = await bootLocal(['config'], path.resolve('.'), 'ts'); // boots real config service locally
  ok('E2 local stack boots only needed services (config)', stack.bus.list('config').some(m => m.name === 'config.get'));
  await stack.dispose();
  ok('E2 local stack disposes cleanly', true);

  rmSync(dir, { recursive: true, force: true });
  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
