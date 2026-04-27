import { describe, it, expect, beforeEach } from 'vitest';
import type { NormalizedInboundMessage, AdapterDeps } from '../../contracts.js';
import { BaseChannelAdapter } from '../../base-adapter.js';
import { createMessageDebouncer } from '../../debounce.js';

/**
 * Unit tests for metadata threading through the channel adapter pipeline.
 * Ensures normalized messages from adapters flows correctly to onInboundMessage.
 */

class MetadataCapturingAdapter extends BaseChannelAdapter {
  readonly type = 'test-metadata' as const;
  capturedCalls: Array<{ sessionKey: string; message: NormalizedInboundMessage }> = [];

  constructor(instanceId: string, debounceMs: number = 10) {
    const deps: AdapterDeps = {
      onInbound: async (sessionKey, message) => {
        this.capturedCalls.push({ sessionKey, message });
      },
    };
    super(instanceId, 'test-metadata', deps, debounceMs);
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async send(): Promise<void> {}
  protected async sendTypingIndicator(): Promise<void> {}
}

describe('Metadata Threading', () => {
  describe('Debouncer carries normalized message to callback', () => {
    it('debouncer passes normalized message from push to onFlush callback', async () => {
      const flushCalls: Array<{ key: string; messages: string[]; metadata?: NormalizedInboundMessage }> = [];
      const debouncer = createMessageDebouncer(
        (key, messages, metadata) => {
          flushCalls.push({ key, messages, metadata });
        },
        { delayMs: 10 },
      );

      const message: NormalizedInboundMessage = {
        messageId: 'msg-123',
        fromUserId: '123',
        fromUser: 'alice',
        chatType: 'group',
        isMentioned: true,
        channelType: 'test',
        skipAgent: false,
      };

      debouncer.push('user-1', 'hello', message);

      // Wait for debouncer to flush
      await new Promise(r => setTimeout(r, 150));

      expect(flushCalls).toHaveLength(1);
      expect(flushCalls[0].metadata).toEqual(message);
    });

    it('debouncer "latest message wins" when multiple messages from same key', async () => {
      const flushCalls: Array<{ key: string; messages: string[]; metadata?: NormalizedInboundMessage }> = [];
      const debouncer = createMessageDebouncer(
        (key, messages, metadata) => {
          flushCalls.push({ key, messages, metadata });
        },
        { delayMs: 10 },
      );

      const msg1: NormalizedInboundMessage = {
        messageId: 'msg-1',
        fromUserId: '1',
        fromUser: 'alice',
        channelType: 'test',
        skipAgent: false,
        chatType: 'private',
        isMentioned: true,
      };
      const msg2: NormalizedInboundMessage = {
        messageId: 'msg-2',
        fromUserId: '2',
        fromUser: 'bob',
        chatType: 'group',
        isMentioned: true,
        channelType: 'test',
        skipAgent: false,
      };

      debouncer.push('user-1', 'first', msg1);
      debouncer.push('user-1', 'second', msg2); // Latest message wins

      await new Promise(r => setTimeout(r, 150));

      expect(flushCalls).toHaveLength(1);
      // Latest message (msg2) should be used
      expect(flushCalls[0].metadata?.messageId).toBe('msg-2');
      expect(flushCalls[0].metadata?.fromUser).toBe('bob');
      expect(flushCalls[0].metadata?.chatType).toBe('group');
      // Both messages accumulated
      expect(flushCalls[0].messages).toEqual(['first', 'second']);
    });
  });

  describe('BaseChannelAdapter threads normalized message to onInboundMessage', () => {
    let adapter: MetadataCapturingAdapter;

    beforeEach(() => {
      adapter = new MetadataCapturingAdapter('test-inst');
    });

    it('handleBatch receives normalized message and forwards to callback', async () => {
      const message: NormalizedInboundMessage = {
        messageId: 'msg-456',
        fromUserId: '456',
        fromUser: 'charlie',
        chatType: 'private',
        isMentioned: true,
        channelType: 'test',
        skipAgent: false,
      };

      // Call handleBatch directly to test it forwards message
      await adapter['handleBatch']('user-1', ['hello', 'world'], message);

      expect(adapter.capturedCalls).toHaveLength(1);
      const call = adapter.capturedCalls[0];
      expect(call.sessionKey).toBe('test-inst:user-1');
      expect(call.message.text).toBe('hello\nworld');
      expect(call.message.messageId).toBe('msg-456');
      expect(call.message.fromUser).toBe('charlie');
    });

    it('debouncer.push with message flows through to onInboundMessage', async () => {
      const message: NormalizedInboundMessage = {
        messageId: 'msg-789',
        fromUserId: '789',
        fromUser: 'diana',
        chatType: 'group',
        isMentioned: true,
        channelType: 'test',
        skipAgent: false,
      };

      adapter['debouncer'].push('user-2', 'test message', message);

      // Wait for debouncer to flush
      await new Promise(r => setTimeout(r, 100));

      expect(adapter.capturedCalls).toHaveLength(1);
      expect(adapter.capturedCalls[0].message.messageId).toBe('msg-789');
      expect(adapter.capturedCalls[0].message.fromUser).toBe('diana');
    });

    it('normalized message is required for batch processing', async () => {
      adapter['debouncer'].push('user-3', 'no message');

      await new Promise(r => setTimeout(r, 100));

      // Without a message, handleBatch should not call onInboundMessage
      expect(adapter.capturedCalls).toHaveLength(0);
    });

    it('multiple messages accumulate, message from last push is used', async () => {
      const msg1: NormalizedInboundMessage = {
        messageId: 'msg-a',
        fromUserId: 'a',
        fromUser: 'user-a',
        chatType: 'private',
        isMentioned: false,
        channelType: 'test',
        skipAgent: false,
      };
      const msg2: NormalizedInboundMessage = {
        messageId: 'msg-b',
        fromUserId: 'b',
        fromUser: 'user-b',
        chatType: 'private',
        isMentioned: false,
        channelType: 'test',
        skipAgent: false,
      };

      adapter['debouncer'].push('user-4', 'msg1', msg1);
      adapter['debouncer'].push('user-4', 'msg2', msg2); // Latest wins

      await new Promise(r => setTimeout(r, 100));

      expect(adapter.capturedCalls).toHaveLength(1);
      expect(adapter.capturedCalls[0].message.text).toBe('msg1\nmsg2');
      expect(adapter.capturedCalls[0].message.messageId).toBe('msg-b');
    });
  });

  describe('Normalized message shape validation', () => {
    it('normalized message preserves all fields through pipeline', async () => {
      const adapter = new MetadataCapturingAdapter('test-inst-2');
      const message: NormalizedInboundMessage = {
        messageId: 'msg-complete',
        fromUserId: 'eve-id',
        fromUser: 'eve',
        chatType: 'group',
        isMentioned: true,
        channelType: 'test',
        skipAgent: false,
      };

      await adapter['handleBatch']('user-5', ['full message'], message);

      expect(adapter.capturedCalls[0].message.messageId).toBe('msg-complete');
      expect(adapter.capturedCalls[0].message.fromUser).toBe('eve');
      expect(adapter.capturedCalls[0].message.chatType).toBe('group');
      expect(adapter.capturedCalls[0].message.isMentioned).toBe(true);
    });

    it('normalized message text is updated with batched content', async () => {
      const adapter = new MetadataCapturingAdapter('test-inst-3');
      const message: NormalizedInboundMessage = {
        messageId: 'msg-partial',
        fromUserId: 'frank-id',
        fromUser: 'frank',
        chatType: 'private',
        isMentioned: false,
        channelType: 'test',
        skipAgent: false,
      };

      await adapter['handleBatch']('user-6', ['partial'], message);

      expect(adapter.capturedCalls[0].message.text).toBe('partial');
      expect(adapter.capturedCalls[0].message.fromUser).toBe('frank');
      expect(adapter.capturedCalls[0].message.chatType).toBe('private');
    });
  });
});
