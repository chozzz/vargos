/**
 * TCP client for connecting to the running bus server
 */

import { createConnection, Socket } from 'node:net';
import { createLogger } from '../../lib/logger.js';
import type { CallableEventKey, HandlerOf, EventParams, EventResult } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';

const log = createLogger('cli-client');
const SOCKET_TIMEOUT = 300_000;

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

interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: 'bus.notify';
  params: { event: string; payload: unknown };
}

export class TCPBusClient {
  private socket: Socket | null = null;
  private nextId = 1;
  private pendingRequests = new Map<number, (res: JSONRPCResponse) => void>();
  private subscriptions = new Map<string, Set<(payload: unknown) => void>>();
  private buffer = '';
  private connected = false;

  constructor(
    private host: string = '127.0.0.1',
    private port: number = 9000,
  ) { }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = createConnection(this.port, this.host, () => {
        log.info(`Connected to bus at ${this.host}:${this.port}`);
        this.connected = true;
        resolve();
      });

      this.socket.on('error', (err) => {
        log.error(`Connection error: ${err.message}`);
        this.connected = false;
        reject(err);
      });

      this.socket.on('close', () => {
        log.info('Connection closed');
        this.connected = false;
      });

      this.socket.on('data', (data) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.socket.setTimeout(SOCKET_TIMEOUT);
      this.socket.on('timeout', () => {
        log.warn('Connection timeout');
        this.socket?.destroy();
      });
    });
  }

  async call<E extends CallableEventKey>(event: E, params: EventParams<E>): Promise<EventResult<E>> {
    if (!this.connected || !this.socket) throw new Error('Not connected');

    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, (res) => {
        if (res.error) {
          reject(new Error(res.error.message));
        } else {
          resolve(res.result as EventResult<E>);
        }
      });

      const req: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: event,
        params,
        id,
      };

      this.socket!.write(`${JSON.stringify(req)}\n`);
    });
  }

  on<E extends keyof EventMap>(event: E, handler: HandlerOf<E>): () => void {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());
      // Send subscription to server
      const req: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'bus.subscribe',
        params: { event },
      };
      this.socket?.write(`${JSON.stringify(req)}\n`);
    }

    const handlers = this.subscriptions.get(event)!;
    const wrappedHandler = (payload: unknown) => {
      // Pure event handler: receive payload and invoke
      (handler as (payload: unknown) => void)(payload);
    };

    handlers.add(wrappedHandler);
    return () => {
      handlers.delete(wrappedHandler);
    };
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines[lines.length - 1];

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const msg = JSON.parse(line);
        if (msg.method === 'bus.notify') {
          // Server notification
          this.handleNotification(msg as JSONRPCNotification);
        } else if (msg.id !== undefined && msg.jsonrpc === '2.0') {
          // Response to our request
          const resolve = this.pendingRequests.get(msg.id);
          if (resolve) {
            this.pendingRequests.delete(msg.id);
            resolve(msg);
          }
        }
      } catch (err) {
        log.error(`Failed to parse message: ${err}`);
      }
    }
  }

  private handleNotification(msg: JSONRPCNotification): void {
    const { event, payload } = msg.params;
    const handlers = this.subscriptions.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (err) {
          log.error(`Handler error for ${event}: ${err}`);
        }
      }
    }
  }
}
