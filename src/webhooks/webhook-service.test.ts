import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GatewayServer } from '../gateway/server.js';
import { ServiceClient } from '../gateway/service-client.js';
import { WebhookService } from './service.js';
import { passthroughTransform, loadTransform } from './transform.js';
import type { WebhookHook, WebhookStatus } from './types.js';

const PORT = 19807;
const HTTP_PORT = 19808;
const GATEWAY_URL = `ws://127.0.0.1:${PORT}`;
const BASE = `http://127.0.0.1:${HTTP_PORT}`;

const TEST_HOOKS: WebhookHook[] = [
  { id: 'github', token: 'secret-gh', description: 'GitHub pushes' },
  { id: 'stripe', token: 'secret-stripe', notify: ['whatsapp:61400000000'], description: 'Stripe events' },
];

function post(hookId: string, token: string, body: unknown = {}) {
  return fetch(`${BASE}/hooks/${hookId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

class TestSubscriber extends ServiceClient {
  events: Array<{ event: string; payload: unknown }> = [];

  constructor() {
    super({
      service: 'subscriber',
      methods: [],
      events: [],
      subscriptions: ['webhook.trigger'],
      gatewayUrl: GATEWAY_URL,
    });
  }
  async handleMethod(): Promise<unknown> { throw new Error('not implemented'); }
  handleEvent(event: string, payload: unknown): void {
    this.events.push({ event, payload });
  }
}

class StubSessionService extends ServiceClient {
  constructor() {
    super({
      service: 'sessions',
      methods: ['session.create'],
      events: [],
      subscriptions: [],
      gatewayUrl: GATEWAY_URL,
    });
  }
  async handleMethod(): Promise<unknown> { return { ok: true }; }
  handleEvent(): void {}
}

describe('WebhookService', () => {
  let gateway: GatewayServer;
  let webhooks: WebhookService;
  let subscriber: TestSubscriber;
  let stubSessions: StubSessionService;

  beforeEach(async () => {
    gateway = new GatewayServer({ port: PORT, host: '127.0.0.1', requestTimeout: 5000, pingInterval: 60_000 });
    await gateway.start();

    stubSessions = new StubSessionService();
    await stubSessions.connect();

    webhooks = new WebhookService({
      gatewayUrl: GATEWAY_URL,
      hooks: TEST_HOOKS,
      port: HTTP_PORT,
      host: '127.0.0.1',
    });
    await webhooks.connect();
    await webhooks.startHttp();

    subscriber = new TestSubscriber();
    await subscriber.connect();
  });

  afterEach(async () => {
    await subscriber.disconnect();
    await webhooks.stopHttp();
    await webhooks.disconnect();
    await stubSessions.disconnect();
    await gateway.stop();
  });

  // ── Gateway methods ────────────────────────────────────────────────────

  it('lists hooks via gateway without exposing tokens', async () => {
    const hooks = await subscriber.call<Array<Record<string, unknown>>>('webhook', 'webhook.list', {});
    expect(hooks).toHaveLength(2);
    expect(hooks.map(h => h.id)).toEqual(['github', 'stripe']);
    // Tokens must never be returned
    for (const h of hooks) {
      expect(h).not.toHaveProperty('token');
    }
  });

  it('returns status with zero fires initially', async () => {
    const statuses = await subscriber.call<WebhookStatus[]>('webhook', 'webhook.status', {});
    expect(statuses).toHaveLength(2);
    expect(statuses[0].totalFires).toBe(0);
    expect(statuses[0].lastFired).toBeUndefined();
  });

  // ── Successful fire ────────────────────────────────────────────────────

  it('fires webhook.trigger on valid POST', async () => {
    const res = await post('github', 'secret-gh', { ref: 'refs/heads/main' });

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 200));

    const trigger = subscriber.events.find(e => e.event === 'webhook.trigger');
    expect(trigger).toBeDefined();
    const p = trigger!.payload as Record<string, unknown>;
    expect(p.hookId).toBe('github');
    expect(p.sessionKey).toBe('webhook:github');
    // Passthrough transform yields JSON
    expect(JSON.parse(p.task as string)).toEqual({ ref: 'refs/heads/main' });
  });

  it('updates fire stats after trigger', async () => {
    await post('github', 'secret-gh', { event: 'push' });
    await new Promise((r) => setTimeout(r, 200));

    const statuses = await subscriber.call<WebhookStatus[]>('webhook', 'webhook.status', {});
    const gh = statuses.find(s => s.id === 'github');
    expect(gh).toBeDefined();
    expect(gh!.totalFires).toBe(1);
    expect(gh!.lastFired).toBeTypeOf('number');
  });

  it('includes notify targets in webhook.trigger event', async () => {
    await post('stripe', 'secret-stripe', { type: 'payment_intent.succeeded' });
    await new Promise((r) => setTimeout(r, 200));

    const trigger = subscriber.events.find(
      e => e.event === 'webhook.trigger' && (e.payload as any).hookId === 'stripe',
    );
    expect(trigger).toBeDefined();
    expect((trigger!.payload as any).notify).toEqual(['whatsapp:61400000000']);
  });

  // ── Auth rejection ─────────────────────────────────────────────────────

  it('rejects with 401 on wrong bearer token', async () => {
    const res = await post('github', 'wrong-token');
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when no Authorization header', async () => {
    const res = await fetch(`${BASE}/hooks/github`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  // ── Route handling ─────────────────────────────────────────────────────

  it('returns 404 for unknown hook ID', async () => {
    const res = await post('unknown', 'whatever');
    expect(res.status).toBe(404);
  });

  it('returns 404 for GET request', async () => {
    const res = await fetch(`${BASE}/hooks/github`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-hooks path', async () => {
    const res = await fetch(`${BASE}/other`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for malformed hook ID', async () => {
    const res = await fetch(`${BASE}/hooks/bad%20id!`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer x' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  // ── Body handling ──────────────────────────────────────────────────────

  it('handles invalid JSON body gracefully', async () => {
    const res = await fetch(`${BASE}/hooks/github`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer secret-gh' },
      body: 'not json',
    });
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 200));

    // Still fires with empty payload
    const trigger = subscriber.events.find(e => e.event === 'webhook.trigger');
    expect(trigger).toBeDefined();
    expect(JSON.parse((trigger!.payload as any).task)).toEqual({});
  });
});

// ── Transform unit tests (no gateway needed) ─────────────────────────────

describe('passthroughTransform', () => {
  it('serializes object to formatted JSON', () => {
    const result = passthroughTransform({ key: 'value' });
    expect(JSON.parse(result)).toEqual({ key: 'value' });
    expect(result).toContain('\n'); // pretty-printed
  });

  it('handles null and primitives', () => {
    expect(passthroughTransform(null)).toBe('null');
    expect(passthroughTransform(42)).toBe('42');
  });
});

describe('loadTransform', () => {
  it('rejects non-existent module', async () => {
    await expect(loadTransform('./nonexistent-module-xyz.js'))
      .rejects.toThrow();
  });

  it('rejects path escaping baseDir', async () => {
    await expect(loadTransform('../../etc/passwd', '/home/safe'))
      .rejects.toThrow('escapes data directory');
  });
});
