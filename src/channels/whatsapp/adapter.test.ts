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

  describe('runViaGateway — typing indicator JID normalization', () => {
    it('normalizes JID for sendPresenceUpdate', async () => {
      const gatewayCall = vi.fn()
        .mockResolvedValueOnce(undefined) // session.create
        .mockResolvedValueOnce(undefined) // session.addMessage
        .mockResolvedValueOnce({ success: true, response: 'ok' }); // agent.run

      (adapter as any).gatewayCall = gatewayCall;

      await (adapter as any).runViaGateway({
        sessionKey: 'whatsapp:61423222658',
        jid: '+61423222658',
        content: 'test',
        channel: 'whatsapp',
      });

      expect(sock.sendPresenceUpdate).toHaveBeenCalledWith(
        'composing',
        '61423222658@s.whatsapp.net',
      );
    });

    it('passes through already-formatted JID for typing', async () => {
      const gatewayCall = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ success: true, response: 'ok' });

      (adapter as any).gatewayCall = gatewayCall;

      await (adapter as any).runViaGateway({
        sessionKey: 'whatsapp:61423222658',
        jid: '61423222658@s.whatsapp.net',
        content: 'test',
        channel: 'whatsapp',
      });

      expect(sock.sendPresenceUpdate).toHaveBeenCalledWith(
        'composing',
        '61423222658@s.whatsapp.net',
      );
    });
  });
});
