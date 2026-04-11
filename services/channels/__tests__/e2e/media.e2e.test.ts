import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitterBus } from '../../../../gateway/emitter.js';
import { ChannelService } from '../../index.js';
import type { ChannelAdapter } from '../../types.js';
import { InboundMediaHandler, type InboundMediaSource } from '../../media-handler.js';
import type { AppConfig } from '../../../config/index.js';

/**
 * Mock adapter for testing media flow through channels service.
 * Simulates WhatsApp/Telegram adapter behavior without platform dependencies.
 */
class MockMediaAdapter extends InboundMediaHandler {
  readonly type = 'mock' as const;

  constructor(
    instanceId: string,
    allowFrom?: string[],
    onInboundMessage?: (sessionKey: string, content: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) {
    super(instanceId, 'mock', allowFrom, onInboundMessage, 0);
  }

  async start(): Promise<void> {
    this.status = 'connected';
  }

  async stop(): Promise<void> {
    this.status = 'disconnected';
  }

  async send(_sessionKey: string, _text: string): Promise<void> {
    // Mock: no-op
  }

  protected async sendTypingIndicator(_sessionKey: string): Promise<void> {
    // Mock: no-op
  }

  protected async resolveMedia(msg: unknown): Promise<InboundMediaSource | null> {
    const m = msg as { buffer: Buffer; mimeType: string; mediaType: string; caption?: string };
    return {
      buffer: m.buffer,
      mimeType: m.mimeType,
      mediaType: m.mediaType as InboundMediaSource['mediaType'],
      caption: m.caption,
    };
  }
}

describe('Channels E2E — Media/Audio Flow', () => {
  let bus: EventEmitterBus;
  let channelService: ChannelService;
  let adapter: MockMediaAdapter;
  let inboundMessages: Array<{ sessionKey: string; content: string; metadata?: Record<string, unknown> }> = [];

  const mockConfig: AppConfig = {
    providers: {
      test: {
        baseUrl: 'http://localhost',
        apiKey: 'test',
        api: 'test',
        models: [{ id: 'test-model', name: 'Test Model' }],
      },
    },
    agent: {
      model: 'test:test-model',
      executionTimeoutMs: 30000,
    },
    channels: [],
    cron: { tasks: [] },
    webhooks: [],
    heartbeat: {},
    linkExpand: {},
    mcp: {},
    paths: {},
    gateway: { port: 9000 },
  };

  beforeEach(async () => {
    bus = new EventEmitterBus();
    channelService = new ChannelService(bus, mockConfig);
    inboundMessages = [];

    // Capture all inbound messages routed through the channel service
    const originalOnInboundMessage = channelService['onInboundMessage'].bind(channelService);
    vi.spyOn(channelService, 'onInboundMessage' as any).mockImplementation(async (sessionKey, content, metadata) => {
      inboundMessages.push({ sessionKey, content, metadata });
      // Don't actually call the agent in this test
    });

    bus.bootstrap(channelService);

    // Create and register mock adapter
    adapter = new MockMediaAdapter('mock-test', ['12345'], channelService['onInboundMessage'].bind(channelService));
    await adapter.start();
    (channelService as any).adapters.set('mock-test', adapter);
  });

  describe('Audio message flow', () => {
    it('receives audio buffer and routes to onInboundMessage', async () => {
      const audioBuffer = Buffer.from([0xFF, 0xFB, 0x10, 0x00]); // MP3 header
      const sessionKey = 'mock-test:12345';

      await adapter['processInboundMedia'](
        {
          buffer: audioBuffer,
          mimeType: 'audio/mpeg',
          mediaType: 'audio',
          caption: 'Voice memo',
        },
        '12345',
        sessionKey,
        (text, metadata) => adapter['routeToService'](sessionKey, text, metadata),
      );

      // Wait for async processing
      await new Promise(r => setTimeout(r, 50));

      // Verify message was routed exactly once
      expect(inboundMessages).toHaveLength(1);
      const msg = inboundMessages[0];
      expect(msg.sessionKey).toBe(sessionKey);
      expect(msg.content).toContain('Voice message');
      expect(msg.content).toContain('saved:');
      expect(msg.metadata?.media?.type).toBe('audio');
    });

    it('does not duplicate messages on media processing', async () => {
      const imageBuffer = Buffer.from([0xFF, 0xD8, 0xFF]); // JPEG header
      const sessionKey = 'mock-test:12345';

      // Process same image multiple times
      for (let i = 0; i < 3; i++) {
        await adapter['processInboundMedia'](
          {
            buffer: imageBuffer,
            mimeType: 'image/jpeg',
            mediaType: 'image',
            caption: 'Test image',
          },
          '12345',
          sessionKey,
          (text, metadata) => adapter['routeToService'](sessionKey, text, metadata),
        );
      }

      await new Promise(r => setTimeout(r, 50));

      // Each should be routed independently, not deduplicated (dedup happens at adapter level)
      expect(inboundMessages).toHaveLength(3);
      inboundMessages.forEach(msg => {
        expect(msg.sessionKey).toBe(sessionKey);
        expect(msg.content).toContain('Test image');
        expect(msg.metadata?.images).toBeDefined();
      });
    });
  });

  describe('Image message flow', () => {
    it('includes base64 image data in metadata', async () => {
      const imageBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const sessionKey = 'mock-test:12345';

      await adapter['processInboundMedia'](
        {
          buffer: imageBuffer,
          mimeType: 'image/jpeg',
          mediaType: 'image',
          caption: 'Photo',
        },
        '12345',
        sessionKey,
        (text, metadata) => adapter['routeToService'](sessionKey, text, metadata),
      );

      await new Promise(r => setTimeout(r, 50));

      expect(inboundMessages).toHaveLength(1);
      const msg = inboundMessages[0];
      expect(msg.metadata?.images).toBeDefined();
      expect(msg.metadata?.images![0]).toHaveProperty('data');
      expect(msg.metadata?.images![0]).toHaveProperty('mimeType', 'image/jpeg');
    });
  });

  describe('Session key routing', () => {
    it('preserves sessionKey through entire media flow', async () => {
      const buffer = Buffer.from('test audio');
      const sessionKey = 'mock-test:user-456';

      await adapter['processInboundMedia'](
        {
          buffer,
          mimeType: 'audio/wav',
          mediaType: 'audio',
        },
        'user-456',
        sessionKey,
        (text, metadata) => adapter['routeToService'](sessionKey, text, metadata),
      );

      await new Promise(r => setTimeout(r, 50));

      expect(inboundMessages[0].sessionKey).toBe(sessionKey);
      // Verify extractUserId can extract the user from sessionKey
      expect(adapter.extractUserId(sessionKey)).toBe('user-456');
    });

    it('routes different users to different sessions', async () => {
      const user1Session = 'mock-test:user-1';
      const user2Session = 'mock-test:user-2';
      const buffer = Buffer.from('audio');

      // Route from user 1
      await adapter['processInboundMedia'](
        { buffer, mimeType: 'audio/wav', mediaType: 'audio' },
        'user-1',
        user1Session,
        (text, metadata) => adapter['routeToService'](user1Session, text, metadata),
      );

      // Route from user 2
      await adapter['processInboundMedia'](
        { buffer, mimeType: 'audio/wav', mediaType: 'audio' },
        'user-2',
        user2Session,
        (text, metadata) => adapter['routeToService'](user2Session, text, metadata),
      );

      await new Promise(r => setTimeout(r, 50));

      expect(inboundMessages).toHaveLength(2);
      expect(inboundMessages[0].sessionKey).toBe(user1Session);
      expect(inboundMessages[1].sessionKey).toBe(user2Session);
    });
  });

  describe('Media metadata integrity', () => {
    it('preserves media type in metadata', async () => {
      const buffer = Buffer.from('document');
      const sessionKey = 'mock-test:12345';

      await adapter['processInboundMedia'](
        {
          buffer,
          mimeType: 'application/pdf',
          mediaType: 'document',
          caption: 'Invoice',
        },
        '12345',
        sessionKey,
        (text, metadata) => adapter['routeToService'](sessionKey, text, metadata),
      );

      await new Promise(r => setTimeout(r, 50));

      const msg = inboundMessages[0];
      expect(msg.metadata?.media?.type).toBe('document');
      expect(msg.metadata?.media?.mimeType).toBe('application/pdf');
      expect(msg.content).toContain('Invoice');
    });

    it('includes path reference without duplicating data', async () => {
      const buffer = Buffer.from('data');
      const sessionKey = 'mock-test:12345';

      await adapter['processInboundMedia'](
        {
          buffer,
          mimeType: 'audio/ogg',
          mediaType: 'audio',
        },
        '12345',
        sessionKey,
        (text, metadata) => adapter['routeToService'](sessionKey, text, metadata),
      );

      await new Promise(r => setTimeout(r, 50));

      const msg = inboundMessages[0];
      // Verify path is included in both content text and metadata
      expect(msg.content).toMatch(/saved:/);
      expect(msg.metadata?.media?.path).toBeDefined();
      // But base64 should only be in metadata.media, not duplicated in content
      expect(msg.content).not.toContain(buffer.toString('base64'));
    });
  });
});
