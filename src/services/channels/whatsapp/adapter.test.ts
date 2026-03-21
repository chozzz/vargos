import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WASocket } from '@whiskeysockets/baileys';
import { AdapterTestHarness } from '../test-utils/harness.js';

// Stub external deps that adapter imports
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: vi.fn(() => true) };
});
vi.mock('./session.js', () => ({ createWhatsAppSocket: vi.fn() }));
vi.mock('../../../lib/dedupe.js', () => ({
  createDedupeCache: () => ({ add: () => true }),
}));
vi.mock('../../../lib/debounce.js', () => ({
  createMessageDebouncer: (cb: Function) => ({
    push: (jid: string, text: string) => cb(jid, [text]),
    cancelAll: vi.fn(),
  }),
}));
vi.mock('../../../lib/media.js', () => ({ saveMedia: vi.fn(async () => '/tmp/saved-media.jpg') }));
vi.mock('../delivery.js', () => ({
  deliverReply: async (send: Function, text: string) => send(text),
}));
vi.mock('../../../config/paths.js', () => ({
  resolveChannelsDir: () => '/tmp/channels',
  resolveMediaDir: () => '/tmp/media',
}));
const mockReset = vi.fn();
vi.mock('../../../lib/reconnect.js', () => ({
  Reconnector: class {
    reset = mockReset;
    next() { return null; }
    attempts = 0;
  },
}));
vi.mock('../../../lib/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

import { WhatsAppAdapter } from './adapter.js';
import { createWhatsAppSocket } from './session.js';
import { existsSync } from 'node:fs';

const harness = new AdapterTestHarness();

function mockSocket(): WASocket {
  return {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendPresenceUpdate: vi.fn().mockResolvedValue(undefined),
    end: vi.fn(),
    ev: { on: vi.fn() },
  } as unknown as WASocket;
}

describe('WhatsAppAdapter', () => {
  let adapter: WhatsAppAdapter;
  let sock: WASocket;

  beforeEach(() => {
    harness.reset();
    adapter = new WhatsAppAdapter('whatsapp');
    sock = mockSocket();
    // Inject mock socket via private field
    (adapter as any).sock = sock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('send — JID normalization', () => {
    it('normalizes phone with + prefix to JID', async () => {
      await adapter.send('+61423222658', 'hello');

      expect(sock.sendMessage).toHaveBeenCalledWith(
        '61423222658@s.whatsapp.net',
        { text: 'hello' },
      );
    });

    it('normalizes phone without + prefix to JID', async () => {
      await adapter.send('61423222658', 'hello');

      expect(sock.sendMessage).toHaveBeenCalledWith(
        '61423222658@s.whatsapp.net',
        { text: 'hello' },
      );
    });

    it('passes through already-formatted s.whatsapp.net JID', async () => {
      await adapter.send('61423222658@s.whatsapp.net', 'hello');

      expect(sock.sendMessage).toHaveBeenCalledWith(
        '61423222658@s.whatsapp.net',
        { text: 'hello' },
      );
    });

    it('passes through LID-format JID', async () => {
      await adapter.send('abc123@lid', 'hello');

      expect(sock.sendMessage).toHaveBeenCalledWith(
        'abc123@lid',
        { text: 'hello' },
      );
    });

    it('passes through group JID', async () => {
      await adapter.send('120363001234@g.us', 'hello');

      expect(sock.sendMessage).toHaveBeenCalledWith(
        '120363001234@g.us',
        { text: 'hello' },
      );
    });

    it('throws when socket is not connected', async () => {
      (adapter as any).sock = null;
      await expect(adapter.send('+61423222658', 'hello'))
        .rejects.toThrow('WhatsApp not connected');
    });
  });

  describe('startTyping / stopTyping', () => {
    it('starts typing indicator with JID normalization', () => {
      adapter.startTyping('+61423222658');

      expect(sock.sendPresenceUpdate).toHaveBeenCalledWith(
        'composing',
        '61423222658@s.whatsapp.net',
      );
    });

    it('stops typing and clears interval', () => {
      adapter.startTyping('61423222658');
      adapter.stopTyping('61423222658');

      // No error — interval cleared
      expect(sock.sendPresenceUpdate).toHaveBeenCalledTimes(1);
    });

    it('is idempotent for startTyping', () => {
      adapter.startTyping('61423222658');
      adapter.startTyping('61423222658');

      // Only one initial call
      expect(sock.sendPresenceUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleInbound — text path normalizes JID', () => {
    it('strips @s.whatsapp.net before routing', async () => {
      const onInbound = vi.fn().mockResolvedValue(undefined);
      const a = new WhatsAppAdapter('whatsapp', undefined, onInbound);
      (a as any).sock = sock;

      // Simulate handleInbound with a text message
      (a as any).handleInbound({
        jid: '61423222658@s.whatsapp.net',
        text: 'hello',
        fromMe: false,
        isGroup: false,
        messageId: 'msg-1',
      });

      // Debouncer mock fires synchronously → routeToService called with normalized userId and messageId
      expect(onInbound).toHaveBeenCalledWith('whatsapp', '61423222658', 'hello', { messageId: 'msg-1' });
    });
  });

  describe('routeToService', () => {
    it('calls onInboundMessage callback', async () => {
      const onInbound = vi.fn().mockResolvedValue(undefined);
      const adapterWithCb = new WhatsAppAdapter('whatsapp', undefined, onInbound);
      (adapterWithCb as any).sock = sock;

      await (adapterWithCb as any).routeToService('61423222658', 'test message');

      expect(onInbound).toHaveBeenCalledWith('whatsapp', '61423222658', 'test message', undefined);
    });

    it('logs error when no callback is set', async () => {
      // Default adapter has no callback — should not throw
      await (adapter as any).routeToService('61423222658', 'test');
    });
  });

  describe('reconnector reset on successful connection', () => {
    it('resets the reconnector when onConnected fires so retries start fresh', async () => {
      const mockedCreate = vi.mocked(createWhatsAppSocket);
      let capturedCallbacks: Record<string, Function> = {};

      mockedCreate.mockImplementationOnce(async (_dir, callbacks) => {
        capturedCallbacks = callbacks as unknown as Record<string, Function>;
        return sock;
      });

      mockReset.mockClear();

      await adapter.start();
      expect(mockReset).not.toHaveBeenCalled();

      // Simulate a successful connection
      capturedCallbacks.onConnected('Test User');

      expect(mockReset).toHaveBeenCalledOnce();
      expect((adapter as any).status).toBe('connected');
    });
  });

  describe('start — auth state guard', () => {
    it('throws and sets status to error when creds.json is missing', async () => {
      vi.mocked(existsSync).mockReturnValueOnce(false);

      await expect(adapter.start()).rejects.toThrow('No auth state found');
      expect((adapter as any).status).toBe('error');
    });

    it('proceeds normally when creds.json exists', async () => {
      vi.mocked(existsSync).mockReturnValueOnce(true);
      vi.mocked(createWhatsAppSocket).mockResolvedValueOnce(sock);

      await adapter.start();

      expect(createWhatsAppSocket).toHaveBeenCalled();
    });
  });

  describe('instanceId routing', () => {
    it('routes inbound messages using instanceId not platform type', async () => {
      const onInbound = vi.fn().mockResolvedValue(undefined);
      const a = new WhatsAppAdapter('whatsapp-personal', undefined, onInbound);
      (a as any).sock = sock;

      (a as any).handleInbound({
        jid: '61423222658@s.whatsapp.net',
        text: 'hey',
        fromMe: false,
        isGroup: false,
        messageId: 'msg-2',
      });

      expect(onInbound).toHaveBeenCalledWith('whatsapp-personal', '61423222658', 'hey', { messageId: 'msg-2' });
    });
  });
});
