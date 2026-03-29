/**
 * TCP/JSON-RPC server for the bus
 * Minimal wrapper around EventEmitterBus to expose it over TCP
 */

import { createServer, Socket } from 'node:net';
import type { Bus, CallableEventKey } from './bus.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('bus-server');

interface JSONRPCRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id?: number | string;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: { code: number; message: string };
  id?: number | string;
}

interface ClientState {
  subscriptions: Set<string>;
  buffer: string;
}

export function startTCPServer(bus: Bus, host: string, port: number): Promise<() => Promise<void>> {
  return new Promise((resolve, reject) => {
    const server = createServer((socket: Socket) => {
      log.debug(`Client connected from ${socket.remoteAddress}:${socket.remotePort}`);
      const state: ClientState = { subscriptions: new Set(), buffer: '' };

      socket.on('data', (data) => {
        state.buffer += data.toString();
        processBuffer(socket, state, bus);
      });

      socket.on('end', () => {
        log.debug(`Client disconnected from ${socket.remoteAddress}:${socket.remotePort}`);
      });

      socket.on('error', (err) => {
        log.error(`Socket error: ${err.message}`);
      });

      socket.setTimeout(30_000);
      socket.on('timeout', () => {
        log.warn('Client timeout');
        socket.destroy();
      });
    });

    server.listen(port, host, () => {
      log.info(`Bus server listening on ${host}:${port}`);
      resolve(async () => {
        return new Promise<void>((resolveClose, rejectClose) => {
          server.close((err) => {
            if (err) rejectClose(err);
            else resolveClose();
          });
        });
      });
    });

    server.on('error', (err) => {
      log.error(`Server error: ${err.message}`);
      reject(err);
    });
  });
}

function processBuffer(socket: Socket, state: ClientState, bus: Bus): void {
  const lines = state.buffer.split('\n');
  state.buffer = lines[lines.length - 1];

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const req = JSON.parse(line) as JSONRPCRequest;
      handleRequest(socket, state, bus, req);
    } catch (err) {
      log.error(`Failed to parse request: ${err}`);
      socket.write(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error' },
          id: null,
        }) + '\n',
      );
    }
  }
}

async function handleRequest(
  socket: Socket,
  state: ClientState,
  bus: Bus,
  req: JSONRPCRequest,
): Promise<void> {
  const { method, params, id } = req;

  // Handle subscription
  if (method === 'bus.subscribe') {
    const { event } = params as { event: string };
    if (!state.subscriptions.has(event)) {
      state.subscriptions.add(event);
      // Subscribe to the event and send notifications to client
      bus.on(event as never, ((payload: unknown) => {
        socket.write(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'bus.notify',
            params: { event, payload },
          }) + '\n',
        );
      }) as never);
    }
    return; // No response for subscription
  }

  // Handle RPC call
  if (!bus.isCallable(method)) {
    socket.write(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32601, message: `Method not found: ${method}` },
        id,
      }) + '\n',
    );
    return;
  }

  try {
    const result = await bus.call(method as CallableEventKey, params as never);
    socket.write(
      JSON.stringify({
        jsonrpc: '2.0',
        result,
        id,
      }) + '\n',
    );
  } catch (err) {
    socket.write(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : String(err),
        },
        id,
      }) + '\n',
    );
  }
}
