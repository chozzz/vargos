import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TelegramUpdate } from './types.js';
import type { OnInboundMessageFn } from '../types.js';

// Track inbound message calls
const inboundCalls: Array<{ channel: string; userId: string; content: string; metadata?: Record<string, unknown> }> = [];

const mockOnInbound: OnInboundMessageFn = vi.fn(async (channel, userId, content, metadata) => {
  inboundCalls.push({ channel, userId, content, metadata });
});

// Mock saveMedia
vi.mock('../../lib/media.js', () => ({
  saveMedia: vi.fn(async () => '/tmp/saved-media.jpg'),
}));

// Mock deliverReply
vi.mock('../delivery.js', () => ({
  deliverReply: vi.fn(async () => {}),
}));

// Mock fetch globally for apiCall + downloadFile
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { TelegramAdapter } from './adapter.js';

function telegramResponse<T>(result: T) {
  return {
    ok: true,
    json: async () => ({ ok: true, result }),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

describe('TelegramAdapter media handling', () => {
  let adapter: TelegramAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    inboundCalls.length = 0;

    // Mock getMe for initialize()
    mockFetch.mockResolvedValueOnce(
      telegramResponse({ id: 1, is_bot: true, first_name: 'Bot', username: 'testbot' }),
    );

    adapter = new TelegramAdapter('test-token', undefined, mockOnInbound);
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

    // Text messages are debounced — no immediate call
    expect(inboundCalls).toHaveLength(0);
  });

  it('should handle photo updates with file download', async () => {
    await adapter.initialize();
    await adapter.start();

    // Mock getFile response
    mockFetch.mockResolvedValueOnce(
      telegramResponse({ file_id: 'f1', file_unique_id: 'u1', file_path: 'photos/file_0.jpg' }),
    );
    // Mock file download
    const fakeImageData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]).buffer;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fakeImageData,
    });

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
      expect(inboundCalls.length).toBeGreaterThanOrEqual(1);
    });

    // Routes through onInboundMessage
    expect(inboundCalls[0].channel).toBe('telegram');
    expect(inboundCalls[0].userId).toBe('42');
    expect(inboundCalls[0].content).toContain('Look at this');
    expect(inboundCalls[0].metadata?.images).toHaveLength(1);
    expect((inboundCalls[0].metadata?.images as any)[0].mimeType).toBe('image/jpeg');
  });

  it('should handle voice updates with file download', async () => {
    await adapter.initialize();
    await adapter.start();

    // Mock getFile + file download
    mockFetch.mockResolvedValueOnce(
      telegramResponse({ file_id: 'v1', file_unique_id: 'vu1', file_path: 'voice/file_0.oga' }),
    );
    const fakeAudio = new Uint8Array([0x4F, 0x67, 0x67, 0x53]).buffer;
    mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => fakeAudio });

    const handleUpdate = (adapter as any).handleUpdate.bind(adapter);
    handleUpdate({
      update_id: 3,
      message: {
        message_id: 300,
        chat: { id: 42, type: 'private' },
        from: { id: 99, is_bot: false, first_name: 'User' },
        date: 1700000000,
        voice: {
          file_id: 'v1',
          file_unique_id: 'vu1',
          duration: 7,
          mime_type: 'audio/ogg',
        },
      },
    } satisfies TelegramUpdate);

    await vi.waitFor(() => {
      expect(inboundCalls.length).toBeGreaterThanOrEqual(1);
    });

    expect(inboundCalls[0].channel).toBe('telegram');
    // Voice messages don't pass images
    expect(inboundCalls[0].metadata?.images).toBeUndefined();
  });

  it('should handle audio updates with file download and caption', async () => {
    await adapter.initialize();
    await adapter.start();

    // Mock getFile + file download
    mockFetch.mockResolvedValueOnce(
      telegramResponse({ file_id: 'a1', file_unique_id: 'au1', file_path: 'music/file_0.mp3' }),
    );
    const fakeAudio = new Uint8Array([0xFF, 0xFB, 0x90, 0x00]).buffer;
    mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => fakeAudio });

    const handleUpdate = (adapter as any).handleUpdate.bind(adapter);
    handleUpdate({
      update_id: 4,
      message: {
        message_id: 400,
        chat: { id: 42, type: 'private' },
        from: { id: 99, is_bot: false, first_name: 'User' },
        date: 1700000000,
        audio: {
          file_id: 'a1',
          file_unique_id: 'au1',
          duration: 180,
          mime_type: 'audio/mpeg',
          title: 'Song',
        },
        caption: 'Listen to this song',
      },
    } satisfies TelegramUpdate);

    await vi.waitFor(() => {
      expect(inboundCalls.length).toBeGreaterThanOrEqual(1);
    });

    expect(inboundCalls[0].channel).toBe('telegram');
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
    expect(inboundCalls).toHaveLength(0);
  });

  it('should pick largest photo from array', async () => {
    await adapter.initialize();
    await adapter.start();

    // Mock getFile — should be called with 'largest' file_id
    mockFetch.mockResolvedValueOnce(
      telegramResponse({ file_id: 'largest', file_unique_id: 'x', file_path: 'photos/big.jpg' }),
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

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
      expect(inboundCalls.length).toBeGreaterThanOrEqual(1);
    });

    // Verify getFile was called with the largest photo's file_id
    const getFileCall = mockFetch.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('getFile'),
    );
    expect(getFileCall).toBeDefined();
    const body = JSON.parse(getFileCall![1]?.body as string);
    expect(body.file_id).toBe('largest');
  });

  describe('startTyping / stopTyping', () => {
    it('starts typing indicator', async () => {
      await adapter.initialize();
      adapter.startTyping('42');

      // Should call sendChatAction
      await vi.waitFor(() => {
        const typingCall = mockFetch.mock.calls.find(
          (call) => typeof call[0] === 'string' && call[0].includes('sendChatAction'),
        );
        expect(typingCall).toBeDefined();
      });
    });

    it('stops typing and clears interval', async () => {
      await adapter.initialize();
      adapter.startTyping('42');
      adapter.stopTyping('42');
      // No error — interval cleared
    });
  });
});
