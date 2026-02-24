/**
 * Webhook service — inbound HTTP webhooks that trigger agent runs
 *
 * Methods: webhook.list, webhook.status
 * Events:  webhook.trigger
 *
 * Fire-and-forget: receive HTTP, transform, emit event.
 * Agent service subscribes and handles execution + delivery.
 */

import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { ServiceClient } from '../gateway/service-client.js';
import { webhookSessionKey } from '../sessions/keys.js';
import { createLogger } from '../lib/logger.js';
import { passthroughTransform, loadTransform } from './transform.js';
import type { WebhookHook, WebhookStatus } from './types.js';

const log = createLogger('webhook');

const MAX_BODY = 1024 * 1024; // 1MB
const HOOK_ID_RE = /^[a-z0-9_-]+$/i;

export interface WebhookServiceConfig {
  gatewayUrl?: string;
  hooks: WebhookHook[];
  port?: number;
  host?: string;
}

export class WebhookService extends ServiceClient {
  private hooks: Map<string, WebhookHook>;
  private stats = new Map<string, { lastFired?: number; totalFires: number }>();
  private server: http.Server | null = null;
  private httpPort: number;
  private httpHost: string;

  constructor(config: WebhookServiceConfig) {
    super({
      service: 'webhook',
      methods: ['webhook.list', 'webhook.status'],
      events: ['webhook.trigger'],
      subscriptions: [],
      gatewayUrl: config.gatewayUrl,
    });
    this.hooks = new Map(config.hooks.map((h) => [h.id, h]));
    for (const h of config.hooks) {
      this.stats.set(h.id, { totalFires: 0 });
    }
    this.httpPort = config.port ?? 9002;
    this.httpHost = config.host ?? '127.0.0.1';
  }

  async handleMethod(method: string, _params: unknown): Promise<unknown> {
    switch (method) {
      case 'webhook.list':
        // Strip tokens — never expose secrets over gateway
        return Array.from(this.hooks.values()).map((h) => ({
          id: h.id,
          description: h.description,
          transform: h.transform,
          notify: h.notify,
        }));
      case 'webhook.status':
        return this.getStatuses();
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  handleEvent(): void {
    // Webhook service subscribes to nothing
  }

  // ── HTTP server ──────────────────────────────────────────────────────────

  async startHttp(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.headersTimeout = 10_000;
      this.server.requestTimeout = 30_000;
      this.server.on('error', reject);
      this.server.listen(this.httpPort, this.httpHost, () => {
        log.info(`http listening on ${this.httpHost}:${this.httpPort}`);
        resolve();
      });
    });
  }

  async stopHttp(): Promise<void> {
    const srv = this.server;
    if (!srv) return;
    this.server = null;
    return new Promise((resolve) => srv.close(() => resolve()));
  }

  // ── Request handling ─────────────────────────────────────────────────────

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method !== 'POST' || !req.url?.startsWith('/hooks/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const hookId = req.url.slice('/hooks/'.length).split('?')[0];
    if (!HOOK_ID_RE.test(hookId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid hook ID' }));
      return;
    }

    const hook = this.hooks.get(hookId);
    if (!hook) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unknown hook' }));
      return;
    }

    // Timing-safe bearer token comparison
    const auth = req.headers.authorization ?? '';
    const expected = `Bearer ${hook.token}`;
    if (auth.length !== expected.length ||
        !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Read body with size cap
    const chunks: Buffer[] = [];
    let size = 0;
    let destroyed = false;

    req.on('error', () => {
      if (!res.writableEnded) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request error' }));
      }
    });

    req.on('data', (chunk: Buffer) => {
      if (destroyed) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        destroyed = true;
        req.destroy();
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (res.writableEnded) return;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));

      let payload: unknown;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        payload = {};
      }

      this.fireHook(hook, payload).catch((err) =>
        log.error(`fire hook ${hookId} failed: ${err}`),
      );
    });
  }

  // ── Fire ──────────────────────────────────────────────────────────────────

  private async fireHook(hook: WebhookHook, payload: unknown): Promise<void> {
    const task = hook.transform
      ? await loadTransform(hook.transform).then((fn) => fn(payload))
      : passthroughTransform(payload);

    const sessionKey = webhookSessionKey(hook.id);

    // Update stats
    const s = this.stats.get(hook.id);
    if (s) { s.lastFired = Date.now(); s.totalFires++; }

    log.info(`fired: ${hook.id}`);
    this.emit('webhook.trigger', {
      hookId: hook.id,
      task,
      sessionKey,
      notify: hook.notify,
    });
  }

  // ── Status ────────────────────────────────────────────────────────────────

  private getStatuses(): WebhookStatus[] {
    return Array.from(this.hooks.values()).map((h) => {
      const s = this.stats.get(h.id) ?? { totalFires: 0 };
      return {
        id: h.id,
        description: h.description,
        lastFired: s.lastFired,
        totalFires: s.totalFires,
      };
    });
  }
}
