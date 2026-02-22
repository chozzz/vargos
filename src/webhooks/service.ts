/**
 * Webhook service — inbound HTTP webhooks that trigger agent runs
 *
 * Methods: webhook.list, webhook.status
 * Events:  webhook.trigger
 *
 * Follows the same fire-and-forget pattern as cron: create session,
 * emit event, let the agent service handle execution + delivery.
 */

import http from 'node:http';
import { ServiceClient } from '../gateway/service-client.js';
import { createLogger } from '../lib/logger.js';
import { passthroughTransform, loadTransform } from './transform.js';
import type { WebhookHook, WebhookStatus } from './types.js';

const log = createLogger('webhook');

const MAX_BODY = 1024 * 1024; // 1MB

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

  async handleMethod(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case 'webhook.list':
        return Array.from(this.hooks.values());
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
      this.server.on('error', reject);
      this.server.listen(this.httpPort, this.httpHost, () => {
        log.info(`http listening on ${this.httpHost}:${this.httpPort}`);
        resolve();
      });
    });
  }

  async stopHttp(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server!.close(() => resolve());
      this.server = null;
    });
  }

  // ── Request handling ─────────────────────────────────────────────────────

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Only POST /hooks/:hookId
    if (req.method !== 'POST' || !req.url?.startsWith('/hooks/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const hookId = req.url.slice('/hooks/'.length).split('?')[0];
    const hook = this.hooks.get(hookId);
    if (!hook) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unknown hook' }));
      return;
    }

    // Bearer token auth
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${hook.token}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Read body with size cap
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (res.writableEnded) return;

      // Respond 200 immediately — processing is async
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

    const sessionKey = `webhook:${hook.id}`;

    // Create persistent session (ignore if exists — accumulates context)
    await this.call('sessions', 'session.create', {
      sessionKey,
      kind: 'webhook',
      metadata: { hookId: hook.id },
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already exists')) log.error(`Failed to create webhook session: ${msg}`);
    });

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
