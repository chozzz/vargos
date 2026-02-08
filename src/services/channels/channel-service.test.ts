import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GatewayServer } from '../../gateway/server.js';
import { ServiceClient } from '../client.js';
import { ChannelService } from './index.js';
import { SessionsService } from '../sessions/index.js';
import { FileSessionService } from '../../extensions/service-file/sessions-file.js';
import type { ChannelAdapter, ChannelStatus, ChannelType } from '../../core/channels/types.js';

const PORT = 19805;
const GATEWAY_URL = `ws://127.0.0.1:${PORT}`;

// Mock adapter
class MockAdapter implements ChannelAdapter {
  readonly type: ChannelType = 'whatsapp';
  status: ChannelStatus = 'connected';
  sentMessages: Array<{ to: string; text: string }> = [];

  async initialize() {}
  async start() { this.status = 'connected'; }
  async stop() { this.status = 'disconnected'; }
  async send(recipientId: string, text: string) {
    this.sentMessages.push({ to: recipientId, text });
  }
}

class TestSubscriber extends ServiceClient {
  events: Array<{ event: string; payload: unknown }> = [];

  constructor() {
    super({
      service: 'test-sub',
      methods: [],
      events: [],
      subscriptions: ['message.received'],
      gatewayUrl: GATEWAY_URL,
    });
  }
  async handleMethod(): Promise<unknown> { throw new Error('not implemented'); }
  handleEvent(event: string, payload: unknown): void {
    this.events.push({ event, payload });
  }
}

describe('ChannelService', () => {
  let gateway: GatewayServer;
  let sessions: SessionsService;
  let channelService: ChannelService;
  let subscriber: TestSubscriber;
  let mockAdapter: MockAdapter;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-channel-test-'));

    gateway = new GatewayServer({ port: PORT, host: '127.0.0.1', requestTimeout: 5000, pingInterval: 60_000 });
    await gateway.start();

    // Sessions service must be up for channel service to call it
    const fileService = new FileSessionService({ baseDir: tmpDir });
    sessions = new SessionsService({ sessionService: fileService, gatewayUrl: GATEWAY_URL });
    await sessions.initialize();
    await sessions.connect();

    channelService = new ChannelService({ gatewayUrl: GATEWAY_URL });
    await channelService.connect();

    mockAdapter = new MockAdapter();
    await channelService.addAdapter(mockAdapter);

    subscriber = new TestSubscriber();
    await subscriber.connect();
  });

  afterEach(async () => {
    await subscriber.disconnect();
    await channelService.disconnect();
    await sessions.disconnect();
    await gateway.stop();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('lists adapters', async () => {
    const list = await subscriber.call<Array<{ type: string; status: string }>>('channel', 'channel.list');
    expect(list.length).toBe(1);
    expect(list[0].type).toBe('whatsapp');
    expect(list[0].status).toBe('connected');
  });

  it('sends messages through adapter', async () => {
    await subscriber.call('channel', 'channel.send', {
      channel: 'whatsapp',
      userId: '123',
      text: 'Hello!',
    });

    expect(mockAdapter.sentMessages.length).toBeGreaterThan(0);
    // deliverReply may split, but all chunks sent
    const fullText = mockAdapter.sentMessages.map((m) => m.text).join('');
    expect(fullText).toBe('Hello!');
  });

  it('emits message.received on inbound', async () => {
    await channelService.onInboundMessage('whatsapp', '456', 'Hey there');

    // Wait for event delivery
    await new Promise((r) => setTimeout(r, 150));

    const evt = subscriber.events.find((e) => e.event === 'message.received');
    expect(evt).toBeDefined();
    expect((evt!.payload as any).channel).toBe('whatsapp');
    expect((evt!.payload as any).userId).toBe('456');
    expect((evt!.payload as any).content).toBe('Hey there');
    expect((evt!.payload as any).sessionKey).toBe('whatsapp:456');
  });

  it('creates session on inbound message', async () => {
    await channelService.onInboundMessage('whatsapp', '789', 'First message');

    // Verify session was created
    const session = await subscriber.call('sessions', 'session.get', { sessionKey: 'whatsapp:789' });
    expect(session).not.toBeNull();
  });

  it('returns adapter status', async () => {
    const status = await subscriber.call<{ type: string; status: string }>('channel', 'channel.status', { channel: 'whatsapp' });
    expect(status.type).toBe('whatsapp');
    expect(status.status).toBe('connected');
  });
});
