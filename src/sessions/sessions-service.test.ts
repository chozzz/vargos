import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GatewayServer } from '../gateway/server.js';
import { ServiceClient } from '../gateway/service-client.js';
import { SessionsService } from './service.js';
import { FileSessionService } from './file-store.js';
import type { Session, SessionMessage } from './types.js';

const PORT = 19803;
const GATEWAY_URL = `ws://127.0.0.1:${PORT}`;

class TestCaller extends ServiceClient {
  events: Array<{ event: string; payload: unknown }> = [];

  constructor() {
    super({
      service: 'test-caller',
      methods: [],
      events: [],
      subscriptions: ['session.created', 'session.message'],
      gatewayUrl: GATEWAY_URL,
    });
  }
  async handleMethod(): Promise<unknown> { throw new Error('not implemented'); }
  handleEvent(event: string, payload: unknown): void {
    this.events.push({ event, payload });
  }
}

describe('SessionsService', () => {
  let gateway: GatewayServer;
  let sessionsService: SessionsService;
  let caller: TestCaller;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-sessions-test-'));

    gateway = new GatewayServer({ port: PORT, host: '127.0.0.1', requestTimeout: 5000, pingInterval: 60_000 });
    await gateway.start();

    const fileService = new FileSessionService({ baseDir: tmpDir });
    sessionsService = new SessionsService({ sessionService: fileService, gatewayUrl: GATEWAY_URL });
    await sessionsService.initialize();
    await sessionsService.connect();

    caller = new TestCaller();
    await caller.connect();
  });

  afterEach(async () => {
    await caller.disconnect();
    await sessionsService.disconnect();
    await gateway.stop();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates and retrieves a session', async () => {
    const created = await caller.call<Session>('sessions', 'session.create', {
      sessionKey: 'test:1',
      kind: 'main',
      metadata: { test: true },
    });
    expect(created.sessionKey).toBe('test:1');

    const fetched = await caller.call<Session | null>('sessions', 'session.get', { sessionKey: 'test:1' });
    expect(fetched?.sessionKey).toBe('test:1');
    expect(fetched?.kind).toBe('main');
  });

  it('lists sessions', async () => {
    await caller.call('sessions', 'session.create', { sessionKey: 'a', kind: 'main', metadata: {} });
    await caller.call('sessions', 'session.create', { sessionKey: 'b', kind: 'main', metadata: {} });

    const list = await caller.call<Session[]>('sessions', 'session.list', {});
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('adds and retrieves messages', async () => {
    await caller.call('sessions', 'session.create', { sessionKey: 'msg-test', kind: 'main', metadata: {} });

    await caller.call('sessions', 'session.addMessage', {
      sessionKey: 'msg-test',
      content: 'Hello',
      role: 'user',
    });

    await caller.call('sessions', 'session.addMessage', {
      sessionKey: 'msg-test',
      content: 'Hi there',
      role: 'assistant',
    });

    const messages = await caller.call<SessionMessage[]>('sessions', 'session.getMessages', {
      sessionKey: 'msg-test',
    });

    expect(messages.length).toBe(2);
    expect(messages[0].content).toBe('Hello');
    expect(messages[1].content).toBe('Hi there');
  });

  it('deletes a session', async () => {
    await caller.call('sessions', 'session.create', { sessionKey: 'del-test', kind: 'main', metadata: {} });
    await caller.call('sessions', 'session.delete', { sessionKey: 'del-test' });

    const fetched = await caller.call<Session | null>('sessions', 'session.get', { sessionKey: 'del-test' });
    expect(fetched).toBeNull();
  });

  it('emits session.created event', async () => {
    await caller.call('sessions', 'session.create', { sessionKey: 'evt-test', kind: 'main', metadata: {} });

    // Wait for event delivery
    await new Promise((r) => setTimeout(r, 100));

    const created = caller.events.find((e) => e.event === 'session.created');
    expect(created).toBeDefined();
    expect((created!.payload as any).sessionKey).toBe('evt-test');
  });

  it('emits session.message event', async () => {
    await caller.call('sessions', 'session.create', { sessionKey: 'msg-evt', kind: 'main', metadata: {} });
    await caller.call('sessions', 'session.addMessage', { sessionKey: 'msg-evt', content: 'hi', role: 'user' });

    await new Promise((r) => setTimeout(r, 100));

    const msgEvt = caller.events.find((e) => e.event === 'session.message');
    expect(msgEvt).toBeDefined();
    expect((msgEvt!.payload as any).role).toBe('user');
  });
});
