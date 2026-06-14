/**
 * JSON-RPC 2.0 over TCP (surface 3). Newline-delimited requests, localhost-bound.
 * Dispatch is a thin projection of the registry: every request becomes bus.call().
 *
 *   echo '{"jsonrpc":"2.0","method":"memory.search","params":{"query":"..."}}' | nc localhost 9000
 *
 * Auth hook: see `authorize()` — a no-op today, the single seam for a future API key.
 */

import { createServer, type Server, type Socket } from 'node:net';
import type { Bus } from './types.js';
import { BusError } from './errors.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('rpc');

interface JsonRpcRequest {
  jsonrpc?: string;
  method: string;
  params?: unknown;
  id?: number | string | null;
}

/** Future API-key seam. Returns null to allow; a string to reject with that reason. */
function authorize(_req: JsonRpcRequest, _socket: Socket): string | null {
  return null; // localhost-only today (out of scope: token auth, non-local binding)
}

export function startRpcServer(bus: Bus, host: string, port: number, socketTimeoutMs = 35 * 60 * 1000): Promise<() => Promise<void>> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((socket) => {
      let buffer = '';
      socket.setTimeout(socketTimeoutMs, () => socket.destroy());
      socket.on('error', (err) => log.debug(`socket error: ${err.message}`));
      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        let nl: number;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line) void handleLine(bus, socket, line);
        }
      });
    });

    server.on('error', reject);
    server.listen(port, host, () => {
      log.info(`JSON-RPC listening on ${host}:${port}`);
      resolve(() => new Promise<void>((res) => server.close(() => res())));
    });
  });
}

async function handleLine(bus: Bus, socket: Socket, line: string): Promise<void> {
  let req: JsonRpcRequest;
  try {
    req = JSON.parse(line);
  } catch {
    return reply(socket, null, undefined, { code: -32700, message: 'Parse error' });
  }

  const id = req.id ?? null;
  const denied = authorize(req, socket);
  if (denied) return reply(socket, id, undefined, { code: -32001, message: denied });

  try {
    const result = await bus.call(req.method, req.params);
    reply(socket, id, result ?? null);
  } catch (err) {
    const code = err instanceof BusError ? err.code : -32603;
    reply(socket, id, undefined, { code, message: err instanceof Error ? err.message : String(err) });
  }
}

function reply(socket: Socket, id: number | string | null, result?: unknown, error?: { code: number; message: string }): void {
  const body = error
    ? { jsonrpc: '2.0', error, id }
    : { jsonrpc: '2.0', result, id };
  socket.write(JSON.stringify(body) + '\n');
  socket.end();
}
