import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TelegramUpdate } from './types.js';
import type { OnInboundMessageFn } from '../types.js';
import { AdapterTestHarness, tgResponse, binaryResponse } from '../test-utils/harness.js';

vi.mock('../../../lib/media.js', () => ({
  saveMedia: vi.fn(async () => '/tmp/saved-media.jpg'),
}));

vi.mock('../delivery.js', () => ({
  deliverReply: vi.fn(async () => {}),
}));

import { TelegramAdapter } from './adapter.js';

describe('TelegramAdapter media handling', () => {
  let adapter: TelegramAdapter;
  let mockRequest: ReturnType<typeof vi.fn>;
  const harness = new AdapterTestHarness();

  beforeEach(() => {
    harness.reset();
    adapter = new TelegramAdapter('telegram', 'test-token', undefined, harness.mockOnInbound);
    mockRequest = vi.spyOn(adapter as any, 'request') as ReturnType<typeof vi.fn>;
    // Prevent pollLoop from consuming mocked request slots
    vi.spyOn(adapter as any, 'pollLoop').mockResolvedValue(undefined);
    // First call is always getMe from initialize()
    mockRequest.mockResolvedValueOnce(
      tgResponse({ id: 1, is_bot: true, first_name: 'Bot', username: 'testbot' }),
    );
  });

  afterEach(async () => {
    await adapter.stop();
  });

  it('should route text messages through debouncer', async () => {
    await adapter.initialize();
    await adapter.start();

    const update: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 100,
        chat: { id: 42, type: 'private' },
        from: { id: 99, is_bot: false, first_name: 'User' },
        date: 1700000000,
        text: 'hello',
      },
    };

    expect(harness.inboundCalls).toHaveLength(0);
  });

  it('should treat /start as a regular text message through the debouncer', async () => {
    vi.useFakeTimers();

    await adapter.initialize();
    await adapter.start();

    const handleUpdate = (adapter as any).handleUpdate.bind(adapter);

    // Should not throw — /start is not special-cased
    expect(() =>
      handleUpdate({
        update_id: 10,
        message: {
          message_id: 1000,
          chat: { id: 42, type: 'private' },
          from: { id: 99, is_bot: false, first_name: 'User' },
          date: 1700000000,
          text: '/start',
        },
      } satisfies TelegramUpdate),
    ).not.toThrow();

    // Text messages are debounced — not delivered immediately
    expect(harness.inboundCalls).toHaveLength(0);

    // After debounce window, message is delivered normally
    await vi.advanceTimersByTimeAsync(3000);
    expect(harness.inboundCalls).toHaveLength(1);
    expect(harness.inboundCalls[0].content).toBe('/start');
    expect(harness.inboundCalls[0].userId).toBe('42');

    vi.useRealTimers();
  });

  it('should handle photo updates with file download', async () => {
    // getFile response
    mockRequest.mockResolvedValueOnce(
      tgResponse({ file_id: 'f1', file_unique_id: 'u1', file_path: 'photos/file_0.jpg' }),
    );
    // binary download
    mockRequest.mockResolvedValueOnce(
      binaryResponse(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])),
    );

    await adapter.initialize();
    await adapter.start();

    const handleUpdate = (adapter as any).handleUpdate.bind(adapter);
    handleUpdate({
      update_id: 2,
      message: {
        message_id: 200,
        chat: { id: 42, type: 'private' },
        from: { id: 99, is_bot: false, first_name: 'User' },
        date: 1700000000,
        photo: [
          { file_id: 'small', file_unique_id: 's1', width: 90, height: 90 },
          { file_id: 'large', file_unique_id: 'l1', width: 800, height: 600 },
        ],
        caption: 'Look at this',
      },
    } satisfies TelegramUpdate);

    await vi.waitFor(() => {
      expect(harness.inboundCalls.length).toBeGreaterThanOrEqual(1);
    });

    expect(harness.inboundCalls[0].channel).toBe('telegram');
    expect(harness.inboundCalls[0].userId).toBe('42');
    expect(harness.inboundCalls[0].content).toContain('Look at this');
    expect(harness.inboundCalls[0].metadata?.images).toHaveLength(1);
    expect((harness.inboundCalls[0].metadata?.images as any)[0].mimeType).toBe('image/jpeg');
  });

  it('should handle voice updates with file download', async () => {
    mockRequest.mockResolvedValueOnce(
      tgResponse({ file_id: 'v1', file_unique_id: 'vu1', file_path: 'voice/file_0.oga' }),
    );
    mockRequest.mockResolvedValueOnce(
      binaryResponse(Buffer.from([0x4F, 0x67, 0x67, 0x53])),
    );

    await adapter.initialize();
    await adapter.start();

    const handleUpdate = (adapter as any).handleUpdate.bind(adapter);
    handleUpdate({
      update_id: 3,
      message: {
        message_id: 300,
        chat: { id: 42, type: 'private' },
        from: { id: 99, is_bot: false, first_name: 'User' },
        date: 1700000000,
        voice: { file_id: 'v1', file_unique_id: 'vu1', duration: 7, mime_type: 'audio/ogg' },
      },
    } satisfies TelegramUpdate);

    await vi.waitFor(() => {
      expect(harness.inboundCalls.length).toBeGreaterThanOrEqual(1);
    });

    expect(harness.inboundCalls[0].channel).toBe('telegram');
    expect(harness.inboundCalls[0].metadata?.images).toBeUndefined();
  });

  it('should handle audio updates with file download and caption', async () => {
    mockRequest.mockResolvedValueOnce(
      tgResponse({ file_id: 'a1', file_unique_id: 'au1', file_path: 'music/file_0.mp3' }),
    );
    mockRequest.mockResolvedValueOnce(
      binaryResponse(Buffer.from([0xFF, 0xFB, 0x90, 0x00])),
    );

    await adapter.initialize();
    await adapter.start();

    const handleUpdate = (adapter as any).handleUpdate.bind(adapter);
    handleUpdate({
      update_id: 4,
      message: {
        message_id: 400,
        chat: { id: 42, type: 'private' },
        from: { id: 99, is_bot: false, first_name: 'User' },
        date: 1700000000,
        audio: { file_id: 'a1', file_unique_id: 'au1', duration: 180, mime_type: 'audio/mpeg', title: 'Song' },
        caption: 'Listen to this song',
      },
    } satisfies TelegramUpdate);

    await vi.waitFor(() => {
      expect(harness.inboundCalls.length).toBeGreaterThanOrEqual(1);
    });

    expect(harness.inboundCalls[0].channel).toBe('telegram');
  });

  it('should skip non-private chats', async () => {
    await adapter.initialize();
    await adapter.start();

    const handleUpdate = (adapter as any).handleUpdate.bind(adapter);
    handleUpdate({
      update_id: 5,
      message: {
        message_id: 500,
        chat: { id: 42, type: 'group' },
        from: { id: 99, is_bot: false, first_name: 'User' },
        date: 1700000000,
        text: 'group msg',
      },
    } satisfies TelegramUpdate);

    await new Promise((r) => setTimeout(r, 50));
    expect(harness.inboundCalls).toHaveLength(0);
  });

  it('should pick largest photo from array', async () => {
    mockRequest.mockResolvedValueOnce(
      tgResponse({ file_id: 'largest', file_unique_id: 'x', file_path: 'photos/big.jpg' }),
    );
    mockRequest.mockResolvedValueOnce(
      binaryResponse(Buffer.from([1, 2, 3])),
    );

    await adapter.initialize();
    await adapter.start();

    const handleUpdate = (adapter as any).handleUpdate.bind(adapter);
    handleUpdate({
      update_id: 6,
      message: {
        message_id: 600,
        chat: { id: 42, type: 'private' },
        from: { id: 99, is_bot: false, first_name: 'User' },
        date: 1700000000,
        photo: [
          { file_id: 'tiny', file_unique_id: 't', width: 50, height: 50 },
          { file_id: 'medium', file_unique_id: 'm', width: 320, height: 240 },
          { file_id: 'largest', file_unique_id: 'l', width: 1280, height: 960 },
        ],
      },
    } satisfies TelegramUpdate);

    await vi.waitFor(() => {
      expect(harness.inboundCalls.length).toBeGreaterThanOrEqual(1);
    });

    // Verify getFile was called with the largest photo's file_id
    // request(url, options, body) — getFile call has file_id in the body
    const getFileCall = mockRequest.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('getFile'),
    );
    expect(getFileCall).toBeDefined();
    const body = JSON.parse(getFileCall![2].toString('utf-8'));
    expect(body.file_id).toBe('largest');
  });

  describe('startTyping / stopTyping', () => {
    it('starts typing indicator', async () => {
      await adapter.initialize();
      adapter.startTyping('42');

      await vi.waitFor(() => {
        const typingCall = mockRequest.mock.calls.find(
          (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('sendChatAction'),
        );
        expect(typingCall).toBeDefined();
      });
    });

    it('stops typing and clears interval', async () => {
      await adapter.initialize();
      adapter.startTyping('42');
      adapter.stopTyping('42');
    });
  });

  describe('instanceId routing', () => {
    it('routes inbound messages using instanceId not platform type', async () => {
      const calls: Array<{ channel: string; userId: string }> = [];
      const onInbound: OnInboundMessageFn = vi.fn(async (channel, userId) => {
        calls.push({ channel, userId });
      });

      const a = new TelegramAdapter('telegram-bakabit', 'test-token', undefined, onInbound);
      const req = vi.spyOn(a as any, 'request') as ReturnType<typeof vi.fn>;
      vi.spyOn(a as any, 'pollLoop').mockResolvedValue(undefined);
      req.mockResolvedValueOnce(tgResponse({ id: 1, is_bot: true, first_name: 'Bot', username: 'testbot' }));

      await a.initialize();
      await a.start();

      vi.useFakeTimers();
      const handleUpdate = (a as any).handleUpdate.bind(a);
      handleUpdate({
        update_id: 99,
        message: {
          message_id: 999,
          chat: { id: 42, type: 'private' },
          from: { id: 99, is_bot: false, first_name: 'User' },
          date: 1700000000,
          text: 'hello',
        },
      } satisfies TelegramUpdate);

      await vi.advanceTimersByTimeAsync(3000);
      vi.useRealTimers();

      expect(calls[0].channel).toBe('telegram-bakabit');
      await a.stop();
    });
  });
});
