import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { GatewayServer } from './server.js';
import {
  parseFrame,
  serializeFrame,
  createRequestId,
  type RequestFrame,
  type ResponseFrame,
  type EventFrame,
  type Frame,
  type ServiceRegistration,
} from './protocol.js';

// ============================================================================
// Protocol tests
// ============================================================================

describe('protocol', () => {
  it('roundtrips a request frame', () => {
    const frame: RequestFrame = { type: 'req', id: 'abc', target: 'tools', method: 'tool.list', params: { foo: 1 } };
    const parsed = parseFrame(serializeFrame(frame));
    expect(parsed).toEqual(frame);
  });

  it('roundtrips a response frame', () => {
    const frame: ResponseFrame = { type: 'res', id: 'abc', ok: true, payload: { tools: [] } };
    const parsed = parseFrame(serializeFrame(frame));
    expect(parsed).toEqual(frame);
  });

  it('roundtrips an error response frame', () => {
    const frame: ResponseFrame = { type: 'res', id: 'abc', ok: false, error: { code: 'NOT_FOUND', message: 'nope' } };
    const parsed = parseFrame(serializeFrame(frame));
    expect(parsed).toEqual(frame);
  });

  it('roundtrips an event frame', () => {
    const frame: EventFrame = { type: 'event', source: 'agent', event: 'run.delta', payload: { text: 'hi' }, seq: 1 };
    const parsed = parseFrame(serializeFrame(frame));
    expect(parsed).toEqual(frame);
  });

  it('rejects invalid frame', () => {
    expect(() => parseFrame('{"type":"bad"}')).toThrow();
    expect(() => parseFrame('not json')).toThrow();
  });

  it('creates unique request ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createRequestId()));
    expect(ids.size).toBe(100);
  });
});

// ============================================================================
// Gateway integration tests
// ============================================================================

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitForMessage(ws: WebSocket): Promise<Frame> {
  return new Promise((resolve) => {
    ws.once('message', (raw) => {
      resolve(parseFrame(raw.toString()));
    });
  });
}

function sendRequest(ws: WebSocket, method: string, params?: unknown, target?: string): string {
  const id = createRequestId();
  const frame: RequestFrame = { type: 'req', id, target: target ?? '', method, params };
  ws.send(serializeFrame(frame));
  return id;
}

async function registerService(ws: WebSocket, reg: ServiceRegistration): Promise<ResponseFrame> {
  const msgPromise = waitForMessage(ws);
  sendRequest(ws, 'gateway.register', reg);
  return msgPromise as Promise<ResponseFrame>;
}

describe('GatewayServer', () => {
  let gateway: GatewayServer;
  let clients: WebSocket[] = [];
  const PORT = 19800; // test port

  beforeEach(async () => {
    gateway = new GatewayServer({ port: PORT, host: '127.0.0.1', requestTimeout: 2000, pingInterval: 60_000 });
    await gateway.start();
    clients = [];
  });

  afterEach(async () => {
    for (const c of clients) {
      if (c.readyState === WebSocket.OPEN) c.close();
    }
    await gateway.stop();
  });

  async function connectClient(): Promise<WebSocket> {
    const ws = await connect(`ws://127.0.0.1:${PORT}`);
    clients.push(ws);
    return ws;
  }

  it('accepts connections', async () => {
    const ws = await connectClient();
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('handles service registration', async () => {
    const ws = await connectClient();
    const reg: ServiceRegistration = {
      service: 'echo',
      version: '1.0.0',
      methods: ['echo.ping'],
      events: ['echo.pong'],
      subscriptions: [],
    };

    const res = await registerService(ws, reg);
    expect(res.type).toBe('res');
    expect(res.ok).toBe(true);
    expect((res.payload as any).services).toContain('echo');
    expect((res.payload as any).methods).toContain('echo.ping');
  });

  it('routes requests between services', async () => {
    // Service A: provides echo.ping
    const serviceA = await connectClient();
    await registerService(serviceA, {
      service: 'echo',
      version: '1.0.0',
      methods: ['echo.ping'],
      events: [],
      subscriptions: [],
    });

    // Service B: calls echo.ping
    const serviceB = await connectClient();
    await registerService(serviceB, {
      service: 'caller',
      version: '1.0.0',
      methods: [],
      events: [],
      subscriptions: [],
    });

    // Set up A to echo back
    serviceA.on('message', (raw) => {
      const frame = parseFrame(raw.toString());
      if (frame.type === 'req' && frame.method === 'echo.ping') {
        const res: ResponseFrame = {
          type: 'res',
          id: frame.id,
          ok: true,
          payload: { echo: frame.params },
        };
        serviceA.send(serializeFrame(res));
      }
    });

    // B calls echo.ping through gateway
    const responsePromise = waitForMessage(serviceB);
    sendRequest(serviceB, 'echo.ping', { msg: 'hello' }, 'echo');

    const response = await responsePromise as ResponseFrame;
    expect(response.type).toBe('res');
    expect(response.ok).toBe(true);
    expect((response.payload as any).echo).toEqual({ msg: 'hello' });
  });

  it('returns error for unknown method', async () => {
    const ws = await connectClient();
    await registerService(ws, {
      service: 'test',
      version: '1.0.0',
      methods: [],
      events: [],
      subscriptions: [],
    });

    const responsePromise = waitForMessage(ws);
    sendRequest(ws, 'nonexistent.method', {}, 'nobody');

    const response = await responsePromise as ResponseFrame;
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe('NO_HANDLER');
  });

  it('fans out events to subscribers', async () => {
    // Publisher
    const publisher = await connectClient();
    await registerService(publisher, {
      service: 'agent',
      version: '1.0.0',
      methods: [],
      events: ['run.delta'],
      subscriptions: [],
    });

    // Subscriber
    const subscriber = await connectClient();
    await registerService(subscriber, {
      service: 'ui',
      version: '1.0.0',
      methods: [],
      events: [],
      subscriptions: ['run.delta'],
    });

    // Publish event
    const eventPromise = waitForMessage(subscriber);
    const event: EventFrame = {
      type: 'event',
      source: 'agent',
      event: 'run.delta',
      payload: { text: 'hello' },
    };
    publisher.send(serializeFrame(event));

    const received = await eventPromise as EventFrame;
    expect(received.type).toBe('event');
    expect(received.event).toBe('run.delta');
    expect((received.payload as any).text).toBe('hello');
    expect(received.seq).toBe(1);
  });

  it('does not deliver events to non-subscribers', async () => {
    const publisher = await connectClient();
    await registerService(publisher, {
      service: 'agent',
      version: '1.0.0',
      methods: [],
      events: ['run.delta'],
      subscriptions: [],
    });

    const nonSubscriber = await connectClient();
    await registerService(nonSubscriber, {
      service: 'other',
      version: '1.0.0',
      methods: [],
      events: [],
      subscriptions: ['run.completed'], // subscribes to different event
    });

    // Track messages received by non-subscriber
    let received = false;
    nonSubscriber.on('message', () => { received = true; });

    const event: EventFrame = {
      type: 'event',
      source: 'agent',
      event: 'run.delta',
      payload: {},
    };
    publisher.send(serializeFrame(event));

    // Wait a bit and verify nothing arrived
    await new Promise((r) => setTimeout(r, 100));
    expect(received).toBe(false);
  });

  it('cleans up routes on disconnect', async () => {
    const serviceA = await connectClient();
    await registerService(serviceA, {
      service: 'ephemeral',
      version: '1.0.0',
      methods: ['ephemeral.do'],
      events: [],
      subscriptions: [],
    });

    // Disconnect
    serviceA.close();
    await new Promise((r) => setTimeout(r, 100));

    // Now try to call the method
    const caller = await connectClient();
    await registerService(caller, {
      service: 'caller',
      version: '1.0.0',
      methods: [],
      events: [],
      subscriptions: [],
    });

    const responsePromise = waitForMessage(caller);
    sendRequest(caller, 'ephemeral.do', {}, 'ephemeral');

    const response = await responsePromise as ResponseFrame;
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe('NO_HANDLER');
  });

  it('times out requests to unresponsive services', async () => {
    // Service that never responds
    const slow = await connectClient();
    await registerService(slow, {
      service: 'slow',
      version: '1.0.0',
      methods: ['slow.wait'],
      events: [],
      subscriptions: [],
    });
    // Deliberately do NOT set up a message handler

    const caller = await connectClient();
    await registerService(caller, {
      service: 'caller',
      version: '1.0.0',
      methods: [],
      events: [],
      subscriptions: [],
    });

    const responsePromise = waitForMessage(caller);
    sendRequest(caller, 'slow.wait', {}, 'slow');

    const response = await responsePromise as ResponseFrame;
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe('TIMEOUT');
  }, 5000);

  it('increments event sequence numbers', async () => {
    const publisher = await connectClient();
    await registerService(publisher, {
      service: 'src',
      version: '1.0.0',
      methods: [],
      events: ['tick'],
      subscriptions: [],
    });

    const subscriber = await connectClient();
    await registerService(subscriber, {
      service: 'sink',
      version: '1.0.0',
      methods: [],
      events: [],
      subscriptions: ['tick'],
    });

    const events: EventFrame[] = [];
    subscriber.on('message', (raw) => {
      const frame = parseFrame(raw.toString());
      if (frame.type === 'event') events.push(frame);
    });

    for (let i = 0; i < 3; i++) {
      publisher.send(serializeFrame({ type: 'event', source: 'src', event: 'tick', payload: { i } }));
    }

    await new Promise((r) => setTimeout(r, 100));
    expect(events.length).toBe(3);
    expect(events[0].seq).toBe(1);
    expect(events[1].seq).toBe(2);
    expect(events[2].seq).toBe(3);
  });
});
