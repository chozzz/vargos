/**
 * Gateway WebSocket server
 * Routes request frames between services, fans out event frames to subscribers
 */

import { WebSocketServer, WebSocket } from 'ws';
import {
  parseFrame,
  serializeFrame,
  ServiceRegistrationSchema,
  type RequestFrame,
  type ResponseFrame,
  type EventFrame,
  type Frame,
} from '../protocol/index.js';
import { Router } from './router.js';
import { EventBus } from './bus.js';
import { ServiceRegistry } from './registry.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('gateway');

export interface GatewayServerOptions {
  port?: number;
  host?: string;
  requestTimeout?: number;
  pingInterval?: number;
}

export class GatewayServer {
  readonly router = new Router();
  readonly bus = new EventBus();
  readonly registry = new ServiceRegistry();

  private wss: WebSocketServer | null = null;
  private port: number;
  private host: string;
  private requestTimeout: number;
  private pingInterval: number;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  // Track pending request forwarding: req.id → caller connection
  private pending = new Map<string, { caller: WebSocket; timer: ReturnType<typeof setTimeout> }>();

  constructor(opts: GatewayServerOptions = {}) {
    this.port = opts.port ?? 9000;
    this.host = opts.host ?? '127.0.0.1';
    this.requestTimeout = opts.requestTimeout ?? 10_000;
    this.pingInterval = opts.pingInterval ?? 30_000;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port, host: this.host });

      this.wss.on('listening', () => {
        this.startPing();
        resolve();
      });

      this.wss.on('error', reject);

      this.wss.on('connection', (ws) => {
        ws.on('message', (raw) => this.onMessage(ws, raw.toString()));
        ws.on('close', () => this.onDisconnect(ws));
        ws.on('error', () => this.onDisconnect(ws));
      });
    });
  }

  async stop(): Promise<void> {
    if (this.pingTimer) clearInterval(this.pingTimer);

    // Reject all pending requests
    for (const [id, { timer }] of this.pending) {
      clearTimeout(timer);
      this.pending.delete(id);
    }

    return new Promise((resolve) => {
      if (!this.wss) return resolve();

      // Close all connections
      for (const client of this.wss.clients) {
        client.close(1001, 'Gateway shutting down');
      }

      this.wss.close(() => {
        this.wss = null;
        resolve();
      });
    });
  }

  get address(): string {
    return `ws://${this.host}:${this.port}`;
  }

  // --------------------------------------------------------------------------
  // Message handling
  // --------------------------------------------------------------------------

  private onMessage(sender: WebSocket, raw: string): void {
    let frame: Frame;
    try {
      frame = parseFrame(raw);
    } catch {
      this.sendError(sender, 'unknown', 'PARSE_ERROR', 'Invalid frame');
      return;
    }

    switch (frame.type) {
      case 'req':
        this.handleRequest(sender, frame);
        break;
      case 'res':
        this.handleResponse(frame);
        break;
      case 'event':
        this.handleEvent(sender, frame);
        break;
    }
  }

  private handleRequest(caller: WebSocket, frame: RequestFrame): void {
    // Special: service registration handshake
    if (frame.method === 'gateway.register') {
      this.handleRegister(caller, frame);
      return;
    }

    // Route to target service
    const target = this.router.route(frame);
    if (!target) {
      log.error(`no handler for method: ${frame.method}`);
      this.sendError(caller, frame.id, 'NO_HANDLER', `No service handles method: ${frame.method}`);
      return;
    }

    if (target.readyState !== WebSocket.OPEN) {
      log.error(`service unavailable: ${frame.method}`);
      this.sendError(caller, frame.id, 'SERVICE_UNAVAILABLE', `Service for ${frame.method} is disconnected`);
      return;
    }

    log.debug(`req ${frame.id} ${frame.method}`);

    // Track the caller so we can route the response back
    const timer = setTimeout(() => {
      this.pending.delete(frame.id);
      log.error(`timeout: ${frame.method} after ${this.requestTimeout}ms`);
      this.sendError(caller, frame.id, 'TIMEOUT', `Request ${frame.method} timed out`);
    }, this.requestTimeout);

    this.pending.set(frame.id, { caller, timer });

    // Forward to target service
    target.send(serializeFrame(frame));
  }

  private handleResponse(frame: ResponseFrame): void {
    const entry = this.pending.get(frame.id);
    if (!entry) return; // No one waiting (already timed out or duplicate)

    clearTimeout(entry.timer);
    this.pending.delete(frame.id);
    log.debug(`res ${frame.id} ok=${frame.ok}`);

    if (entry.caller.readyState === WebSocket.OPEN) {
      entry.caller.send(serializeFrame(frame));
    }
  }

  private handleEvent(sender: WebSocket, frame: EventFrame): void {
    // Look up source service name
    const services = this.registry.list();
    const source = services.find((s) => {
      const entry = this.registry.get(s.service);
      return entry?.conn === sender;
    });

    this.bus.publish(
      source?.service ?? frame.source,
      frame.event,
      frame.payload,
    );
  }

  private handleRegister(conn: WebSocket, frame: RequestFrame): void {
    try {
      const reg = ServiceRegistrationSchema.parse(frame.params);

      this.registry.add(reg, conn);
      this.router.register(reg.methods, conn);
      this.bus.subscribe(reg.subscriptions, conn);
      log.info(`service registered: ${reg.service} (methods=${reg.methods.join(',')})`);

      const routingTable = this.registry.getRoutingTable();

      const response: ResponseFrame = {
        type: 'res',
        id: frame.id,
        ok: true,
        payload: routingTable,
      };
      conn.send(serializeFrame(response));
    } catch (err) {
      this.sendError(conn, frame.id, 'REGISTER_FAILED',
        err instanceof Error ? err.message : 'Invalid registration');
    }
  }

  // --------------------------------------------------------------------------
  // Connection lifecycle
  // --------------------------------------------------------------------------

  private onDisconnect(conn: WebSocket): void {
    const serviceName = this.registry.remove(conn);
    this.router.unregister(conn);
    this.bus.unsubscribe(conn);

    // Reject any pending requests that were waiting on this connection
    for (const [id, entry] of this.pending) {
      if (entry.caller === conn) {
        clearTimeout(entry.timer);
        this.pending.delete(id);
      }
    }

    if (serviceName) {
      log.info(`service disconnected: ${serviceName}`);
      this.bus.publish('gateway', 'service.disconnected', { service: serviceName });
    }
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (!this.wss) return;
      for (const client of this.wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.ping();
        }
      }
    }, this.pingInterval);
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private sendError(conn: WebSocket, id: string, code: string, message: string): void {
    if (conn.readyState !== WebSocket.OPEN) return;

    const frame: ResponseFrame = {
      type: 'res',
      id,
      ok: false,
      error: { code, message },
    };
    conn.send(serializeFrame(frame));
  }
}
