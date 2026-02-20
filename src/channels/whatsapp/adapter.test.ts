import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WASocket } from '@whiskeysockets/baileys';

// Stub external deps that adapter imports
vi.mock('./session.js', () => ({ createWhatsAppSocket: vi.fn() }));
vi.mock('../../lib/dedupe.js', () => ({
  createDedupeCache: () => ({ add: () => true }),
}));
vi.mock('../../lib/debounce.js', () => ({
  createMessageDebouncer: (cb: Function) => ({
    push: (jid: string, text: string) => cb(jid, [text]),
    cancelAll: vi.fn(),
  }),
}));
vi.mock('../../lib/media.js', () => ({ saveMedia: vi.fn() }));
vi.mock('../delivery.js', () => ({
  deliverReply: async (send: Function, text: string) => send(text),
}));
vi.mock('../../config/paths.js', () => ({
  resolveChannelsDir: () => '/tmp/channels',
  resolveMediaDir: () => '/tmp/media',
}));
vi.mock('../../lib/reconnect.js', () => ({
  Reconnector: class { reset() {} next() { return null; } attempts = 0; },
}));
vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

import { WhatsAppAdapter } from './adapter.js';

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
    adapter = new WhatsAppAdapter();
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

  describe('routeToService', () => {
    it('calls onInboundMessage callback', async () => {
      const onInbound = vi.fn().mockResolvedValue(undefined);
      const adapterWithCb = new WhatsAppAdapter(undefined, onInbound);
      (adapterWithCb as any).sock = sock;

      await (adapterWithCb as any).routeToService('61423222658', 'test message');

      expect(onInbound).toHaveBeenCalledWith('whatsapp', '61423222658', 'test message', undefined);
    });

    it('logs error when no callback is set', async () => {
      // Default adapter has no callback — should not throw
      await (adapter as any).routeToService('61423222658', 'test');
    });
  });
});
