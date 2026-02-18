/**
 * Base service client — services extend this to communicate through the gateway
 *
 * Handles: WS connection, registration handshake, RPC calls, event emission,
 * request timeout, auto-reconnect.
 */

import { WebSocket } from 'ws';
import {
  parseFrame,
  serializeFrame,
  createRequestId,
  type RequestFrame,
  type ResponseFrame,
  type Frame,
  type ServiceRegistration,
} from '../protocol/index.js';
import { Reconnector } from '../lib/reconnect.js';
import { createLogger } from '../lib/logger.js';
import type { ServiceMethod } from '../contracts/methods.js';
import type { ServiceEvent } from '../contracts/events.js';

const DEFAULT_GATEWAY_URL = 'ws://127.0.0.1:9000';
const DEFAULT_REQUEST_TIMEOUT = 30_000;

export interface ServiceClientConfig {
  service: string;
  version?: string;
  methods: ServiceMethod[];
  events: ServiceEvent[];
  subscriptions: ServiceEvent[];
  gatewayUrl?: string;
  requestTimeout?: number;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export abstract class ServiceClient {
  protected ws: WebSocket | null = null;
  protected readonly log;
  private pending = new Map<string, PendingRequest>();
  private reconnector = new Reconnector({ maxAttempts: 20 });
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private closing = false;

  constructor(protected config: ServiceClientConfig) {
    this.log = createLogger(config.service);
  }

  get service(): string { return this.config.service; }
  get isConnected(): boolean { return this.connected; }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  async connect(): Promise<void> {
    this.closing = false;
    return this.doConnect();
  }

  async disconnect(): Promise<void> {
    this.closing = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.rejectAllPending('Service disconnecting');
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    this.connected = false;
  }

  // --------------------------------------------------------------------------
  // RPC
  // --------------------------------------------------------------------------

  async call<T = unknown>(target: string, method: string, params?: unknown, callTimeout?: number): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`ServiceClient[${this.config.service}] not connected`);
    }

    const id = createRequestId();
    const timeout = callTimeout ?? this.config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;
    this.log.debug(`call ${method} → ${target}`);

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.log.error(`call ${method} timed out after ${timeout}ms`);
        reject(new Error(`Request ${method} timed out after ${timeout}ms`));
      }, timeout);

      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      const frame: RequestFrame = { type: 'req', id, target, method, params };
      this.ws!.send(serializeFrame(frame));
    });
  }

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------

  emit(event: string, payload?: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(serializeFrame({
      type: 'event',
      source: this.config.service,
      event,
      payload,
    }));
  }

  // --------------------------------------------------------------------------
  // Subclass contract
  // --------------------------------------------------------------------------

  abstract handleMethod(method: string, params: unknown): Promise<unknown>;
  abstract handleEvent(event: string, payload: unknown): void;

  // --------------------------------------------------------------------------
  // Connection internals
  // --------------------------------------------------------------------------

  private doConnect(): Promise<void> {
    const url = this.config.gatewayUrl ?? DEFAULT_GATEWAY_URL;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);

      ws.on('open', async () => {
        this.ws = ws;
        try {
          await this.register();
          this.connected = true;
          this.reconnector.reset();
          this.log.info('connected to gateway');
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      ws.on('message', (raw) => this.onMessage(raw.toString()));

      ws.on('close', () => {
        this.connected = false;
        this.ws = null;
        this.log.info('disconnected');
        if (!this.closing) this.scheduleReconnect();
      });

      ws.on('error', (err) => {
        if (!this.connected) reject(err);
      });
    });
  }

  private async register(): Promise<void> {
    const registration: ServiceRegistration = {
      service: this.config.service,
      version: this.config.version ?? '1.0.0',
      methods: this.config.methods,
      events: this.config.events,
      subscriptions: this.config.subscriptions,
    };

    await this.call('gateway', 'gateway.register', registration);
  }

  private onMessage(raw: string): void {
    let frame: Frame;
    try {
      frame = parseFrame(raw);
    } catch {
      return;
    }

    switch (frame.type) {
      case 'req':
        this.onRequest(frame);
        break;
      case 'res':
        this.onResponse(frame);
        break;
      case 'event':
        this.handleEvent(frame.event, frame.payload);
        break;
    }
  }

  private async onRequest(frame: RequestFrame): Promise<void> {
    this.log.debug(`method ${frame.method} received`);
    try {
      const result = await this.handleMethod(frame.method, frame.params);
      const response: ResponseFrame = { type: 'res', id: frame.id, ok: true, payload: result };
      this.ws?.send(serializeFrame(response));
    } catch (err) {
      const response: ResponseFrame = {
        type: 'res',
        id: frame.id,
        ok: false,
        error: { code: 'METHOD_ERROR', message: err instanceof Error ? err.message : String(err) },
      };
      this.ws?.send(serializeFrame(response));
    }
  }

  private onResponse(frame: ResponseFrame): void {
    const entry = this.pending.get(frame.id);
    if (!entry) return;

    clearTimeout(entry.timer);
    this.pending.delete(frame.id);

    if (frame.ok) {
      entry.resolve(frame.payload);
    } else {
      entry.reject(new Error(frame.error?.message ?? 'Request failed'));
    }
  }

  private scheduleReconnect(): void {
    const delay = this.reconnector.next();
    if (delay === null) return; // Max attempts exhausted

    this.log.error(`reconnect scheduled, attempt ${this.reconnector.attempts}`);
    this.reconnectTimer = setTimeout(() => {
      this.doConnect().catch(() => {
        // Will retry via the close handler
      });
    }, delay);
  }

  private rejectAllPending(reason: string): void {
    for (const [_id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
