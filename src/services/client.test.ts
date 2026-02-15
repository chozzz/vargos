import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GatewayServer } from '../gateway/server.js';
import { ServiceClient, type ServiceClientConfig } from './client.js';
import type { ServiceMethod } from '../contracts/methods.js';
import type { ServiceEvent } from '../contracts/events.js';

const PORT = 19801;
const GATEWAY_URL = `ws://127.0.0.1:${PORT}`;

// Test-only method/event literals — cast to satisfy typed config
const TEST_METHODS = ['echo.ping', 'echo.fail'] as unknown as ServiceMethod[];
const TEST_EVENT = ['test.event'] as unknown as ServiceEvent[];

// Concrete test service that echoes method calls
class EchoService extends ServiceClient {
  received: Array<{ method: string; params: unknown }> = [];
  events: Array<{ event: string; payload: unknown }> = [];

  constructor(config: Partial<ServiceClientConfig> = {}) {
    super({
      service: config.service ?? 'echo',
      methods: config.methods ?? TEST_METHODS,
      events: config.events ?? [],
      subscriptions: config.subscriptions ?? [],
      gatewayUrl: GATEWAY_URL,
      requestTimeout: config.requestTimeout ?? 5000,
    });
  }

  async handleMethod(method: string, params: unknown): Promise<unknown> {
    this.received.push({ method, params });

    if (method === 'echo.ping') {
      return { pong: params };
    }
    if (method === 'echo.fail') {
      throw new Error('Intentional failure');
    }
    throw new Error(`Unknown method: ${method}`);
  }

  handleEvent(event: string, payload: unknown): void {
    this.events.push({ event, payload });
  }
}

// Minimal service that just calls other services
class CallerService extends ServiceClient {
  events: Array<{ event: string; payload: unknown }> = [];

  constructor(subs: ServiceEvent[] = []) {
    super({
      service: 'caller',
      methods: [],
      events: [],
      subscriptions: subs,
      gatewayUrl: GATEWAY_URL,
      requestTimeout: 5000,
    });
  }

  async handleMethod(): Promise<unknown> {
    throw new Error('Caller handles no methods');
  }

  handleEvent(event: string, payload: unknown): void {
    this.events.push({ event, payload });
  }
}

describe('ServiceClient', () => {
  let gateway: GatewayServer;
  let services: ServiceClient[] = [];

  beforeEach(async () => {
    gateway = new GatewayServer({ port: PORT, host: '127.0.0.1', requestTimeout: 3000, pingInterval: 60_000 });
    await gateway.start();
    services = [];
  });

  afterEach(async () => {
    for (const s of services) {
      await s.disconnect();
    }
    await gateway.stop();
  });

  async function createEcho(config?: Partial<ServiceClientConfig>): Promise<EchoService> {
    const s = new EchoService(config);
    await s.connect();
    services.push(s);
    return s;
  }

  async function createCaller(subs: ServiceEvent[] = []): Promise<CallerService> {
    const s = new CallerService(subs);
    await s.connect();
    services.push(s);
    return s;
  }

  it('connects and registers with gateway', async () => {
    const echo = await createEcho();
    expect(echo.isConnected).toBe(true);
  });

  it('handles method calls through gateway', async () => {
    await createEcho();
    const caller = await createCaller();

    const result = await caller.call<{ pong: unknown }>('echo', 'echo.ping', { msg: 'hi' });
    expect(result.pong).toEqual({ msg: 'hi' });
  });

  it('propagates method errors', async () => {
    await createEcho();
    const caller = await createCaller();

    await expect(caller.call('echo', 'echo.fail')).rejects.toThrow('Intentional failure');
  });

  it('times out on unresponsive services', async () => {
    const caller = await createCaller();

    await expect(caller.call('nobody', 'no.method')).rejects.toThrow();
  });

  it('receives events via subscriptions', async () => {
    const echo = new EchoService({
      service: 'publisher',
      methods: [],
      events: TEST_EVENT,
      subscriptions: [],
    });
    await echo.connect();
    services.push(echo);

    const subscriber = await createCaller(TEST_EVENT);

    echo.emit('test.event', { data: 42 });

    // Wait for event delivery
    await new Promise((r) => setTimeout(r, 100));

    expect(subscriber.events.length).toBe(1);
    expect(subscriber.events[0].event).toBe('test.event');
    expect((subscriber.events[0].payload as Record<string, unknown>).data).toBe(42);
  });

  it('reports not connected when calling before connect', async () => {
    const echo = new EchoService();
    // Don't connect
    await expect(echo.call('echo', 'echo.ping')).rejects.toThrow('not connected');
  });

  it('handles multiple concurrent calls', async () => {
    await createEcho();
    const caller = await createCaller();

    const results = await Promise.all([
      caller.call<{ pong: unknown }>('echo', 'echo.ping', { n: 1 }),
      caller.call<{ pong: unknown }>('echo', 'echo.ping', { n: 2 }),
      caller.call<{ pong: unknown }>('echo', 'echo.ping', { n: 3 }),
    ]);

    expect(results.map((r) => (r.pong as Record<string, unknown>).n).sort()).toEqual([1, 2, 3]);
  });

  it('cleans up on disconnect', async () => {
    const echo = await createEcho();
    expect(echo.isConnected).toBe(true);

    await echo.disconnect();
    expect(echo.isConnected).toBe(false);
  });
});
