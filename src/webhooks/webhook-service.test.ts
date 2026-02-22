import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GatewayServer } from '../gateway/server.js';
import { ServiceClient } from '../gateway/service-client.js';
import { WebhookService } from './service.js';
import type { WebhookHook, WebhookStatus } from './types.js';

const PORT = 19807;
const HTTP_PORT = 19808;
const GATEWAY_URL = `ws://127.0.0.1:${PORT}`;

const TEST_HOOKS: WebhookHook[] = [
  { id: 'github', token: 'secret-gh', description: 'GitHub pushes' },
  { id: 'stripe', token: 'secret-stripe', notify: ['whatsapp:61400000000'], description: 'Stripe events' },
];

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

// Stub session service so session.create calls don't fail
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

  it('lists hooks via gateway', async () => {
    const hooks = await subscriber.call<WebhookHook[]>('webhook', 'webhook.list', {});
    expect(hooks).toHaveLength(2);
    expect(hooks.map(h => h.id)).toEqual(['github', 'stripe']);
  });

  it('returns status with zero fires initially', async () => {
    const statuses = await subscriber.call<WebhookStatus[]>('webhook', 'webhook.status', {});
    expect(statuses).toHaveLength(2);
    expect(statuses[0].totalFires).toBe(0);
    expect(statuses[0].lastFired).toBeUndefined();
  });

  it('fires webhook.trigger on valid POST', async () => {
    const res = await fetch(`http://127.0.0.1:${HTTP_PORT}/hooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer secret-gh',
      },
      body: JSON.stringify({ ref: 'refs/heads/main' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    // Wait for async event delivery
    await new Promise((r) => setTimeout(r, 200));

    const trigger = subscriber.events.find(e => e.event === 'webhook.trigger');
    expect(trigger).toBeDefined();
    const p = trigger!.payload as Record<string, unknown>;
    expect(p.hookId).toBe('github');
    expect(p.sessionKey).toBe('webhook:github');
    expect(typeof p.task).toBe('string');
    // Passthrough transform yields JSON
    expect(JSON.parse(p.task as string)).toEqual({ ref: 'refs/heads/main' });
  });

  it('rejects with 401 on wrong bearer token', async () => {
    const res = await fetch(`http://127.0.0.1:${HTTP_PORT}/hooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong-token',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown hook ID', async () => {
    const res = await fetch(`http://127.0.0.1:${HTTP_PORT}/hooks/unknown`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer whatever',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
  });

  it('updates fire stats after trigger', async () => {
    await fetch(`http://127.0.0.1:${HTTP_PORT}/hooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer secret-gh',
      },
      body: JSON.stringify({ event: 'push' }),
    });

    await new Promise((r) => setTimeout(r, 200));

    const statuses = await subscriber.call<WebhookStatus[]>('webhook', 'webhook.status', {});
    const gh = statuses.find(s => s.id === 'github');
    expect(gh).toBeDefined();
    expect(gh!.totalFires).toBe(1);
    expect(gh!.lastFired).toBeTypeOf('number');
  });

  it('includes notify targets in webhook.trigger event', async () => {
    await fetch(`http://127.0.0.1:${HTTP_PORT}/hooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer secret-stripe',
      },
      body: JSON.stringify({ type: 'payment_intent.succeeded' }),
    });

    await new Promise((r) => setTimeout(r, 200));

    const trigger = subscriber.events.find(
      e => e.event === 'webhook.trigger' && (e.payload as any).hookId === 'stripe',
    );
    expect(trigger).toBeDefined();
    expect((trigger!.payload as any).notify).toEqual(['whatsapp:61400000000']);
  });
});
