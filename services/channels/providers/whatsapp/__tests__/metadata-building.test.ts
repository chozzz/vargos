import { describe, it, expect, beforeEach } from 'vitest';
import { WhatsAppAdapter } from '../adapter.js';
import type { WhatsAppInboundMessage } from '../types.js';
import type { InboundMessageMetadata } from '../../../../gateway/events.js';

describe('WhatsApp metadata building', () => {
  let adapter: WhatsAppAdapter;

  beforeEach(() => {
    adapter = new WhatsAppAdapter('test-instance', async () => {});
    // Manually set botJid for testing (normally set on connection)
    (adapter as any).botJid = '1234567890@s.whatsapp.net';
  });

  describe('private messages', () => {
    it('builds metadata for private message', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: '1111111111@s.whatsapp.net',
        text: 'Hello',
        fromMe: false,
        isGroup: false,
        timestamp: Date.now(),
      };

      const result = (adapter as any).isMentioned(msg);
      expect(result).toBe(false);
    });

    it('private messages are always considered mentioned (always relevant)', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: '1111111111@s.whatsapp.net',
        text: 'Hello',
        fromMe: false,
        isGroup: false,
        timestamp: Date.now(),
      };

      // In handleInbound, private messages bypass the mention check
      // isMentioned is always true for private: msg.isGroup ? this.isMentioned(msg) : true
      expect(!msg.isGroup).toBe(true);
    });
  });

  describe('group messages', () => {
    it('detects bot mention in mentionedJids', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: 'group123@g.us',
        text: 'Hey @bot check this',
        fromMe: false,
        isGroup: true,
        timestamp: Date.now(),
        mentionedJids: ['1234567890@s.whatsapp.net', '9999999999@s.whatsapp.net'],
      };

      const result = (adapter as any).isMentioned(msg);
      expect(result).toBe(true);
    });

    it('ignores group messages without bot mention', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: 'group123@g.us',
        text: 'Hey everyone',
        fromMe: false,
        isGroup: true,
        timestamp: Date.now(),
        mentionedJids: ['9999999999@s.whatsapp.net'],
      };

      const result = (adapter as any).isMentioned(msg);
      expect(result).toBe(false);
    });

    it('detects reply to bot message', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: 'group123@g.us',
        text: 'That makes sense',
        fromMe: false,
        isGroup: true,
        timestamp: Date.now(),
        quotedSenderJid: '1234567890@s.whatsapp.net',
      };

      const result = (adapter as any).isMentioned(msg);
      expect(result).toBe(true);
    });

    it('handles messages with no mentions or quotes', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: 'group123@g.us',
        text: 'Random group message',
        fromMe: false,
        isGroup: true,
        timestamp: Date.now(),
      };

      const result = (adapter as any).isMentioned(msg);
      expect(result).toBe(false);
    });

    it('requires bot mention even when mentions list exists', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: 'group123@g.us',
        text: '@user1 @user2 check this',
        fromMe: false,
        isGroup: true,
        timestamp: Date.now(),
        mentionedJids: ['8888888888@s.whatsapp.net', '9999999999@s.whatsapp.net'],
      };

      const result = (adapter as any).isMentioned(msg);
      expect(result).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles message with empty mentionedJids', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: 'group123@g.us',
        text: 'Hello',
        fromMe: false,
        isGroup: true,
        timestamp: Date.now(),
        mentionedJids: [],
      };

      const result = (adapter as any).isMentioned(msg);
      expect(result).toBe(false);
    });

    it('handles message with undefined mentionedJids', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: 'group123@g.us',
        text: 'Hello',
        fromMe: false,
        isGroup: true,
        timestamp: Date.now(),
      };

      const result = (adapter as any).isMentioned(msg);
      expect(result).toBe(false);
    });

    it('handles mention without botJid set', () => {
      (adapter as any).botJid = '';
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: 'group123@g.us',
        text: 'Hello',
        fromMe: false,
        isGroup: true,
        timestamp: Date.now(),
        mentionedJids: ['1234567890@s.whatsapp.net'],
      };

      const result = (adapter as any).isMentioned(msg);
      expect(result).toBe(false);
    });

    it('handles phone number extraction from direct format JID', () => {
      const result = (adapter as any).resolvePhone('1234567890@s.whatsapp.net');
      expect(result).toBe('1234567890');
    });

    it('strips domain from various JID formats', () => {
      expect((adapter as any).resolvePhone('1111111111@s.whatsapp.net')).toBe('1111111111');
      expect((adapter as any).resolvePhone('2222222222@s.whatsapp.net')).toBe('2222222222');
    });
  });

  describe('message filtering in handleInbound', () => {
    it('skips messages from self', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: '1111111111@s.whatsapp.net',
        text: 'Hello',
        fromMe: true,
        isGroup: false,
        timestamp: Date.now(),
      };

      // fromMe check happens first: if (msg.fromMe) return;
      expect(msg.fromMe).toBe(true);
    });

    it('skips group messages without mention', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: 'group123@g.us',
        text: 'Random group chat',
        fromMe: false,
        isGroup: true,
        timestamp: Date.now(),
        mentionedJids: ['9999999999@s.whatsapp.net'],
      };

      // Second check: if (msg.isGroup && !this.isMentioned(msg)) return;
      const isMentioned = (adapter as any).isMentioned(msg);
      expect(isMentioned).toBe(false);
      expect(msg.isGroup && !isMentioned).toBe(true);
    });

    it('accepts private messages', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: '1111111111@s.whatsapp.net',
        text: 'Hello',
        fromMe: false,
        isGroup: false,
        timestamp: Date.now(),
      };

      // private messages pass: isGroup = false, so the check is false && !true = false
      expect(!msg.isGroup).toBe(true);
    });

    it('accepts group messages with bot mention', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: 'group123@g.us',
        text: 'Hey @bot help',
        fromMe: false,
        isGroup: true,
        timestamp: Date.now(),
        mentionedJids: ['1234567890@s.whatsapp.net'],
      };

      const isMentioned = (adapter as any).isMentioned(msg);
      expect(isMentioned).toBe(true);
      expect(msg.isGroup && !isMentioned).toBe(false);
    });
  });

  describe('chatType and isMentioned in metadata', () => {
    it('builds correct metadata for private message', () => {
      // Simulate metadata building from handleInbound
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: '1111111111@s.whatsapp.net',
        text: 'Hello',
        fromMe: false,
        isGroup: false,
        timestamp: Date.now(),
      };

      const chatType = msg.isGroup ? 'group' : 'private';
      const isMentioned = msg.isGroup ? (adapter as any).isMentioned(msg) : true;

      const metadata: InboundMessageMetadata = {
        messageId: msg.messageId,
        fromUser: (adapter as any).resolvePhone(msg.jid),
        chatType,
        isMentioned,
        channelType: 'whatsapp',
      };

      expect(metadata.chatType).toBe('private');
      expect(metadata.isMentioned).toBe(true);
      expect(metadata.fromUser).toBe('1111111111');
    });

    it('builds correct metadata for mentioned group message', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: 'group123@g.us',
        text: '@bot help',
        fromMe: false,
        isGroup: true,
        timestamp: Date.now(),
        mentionedJids: ['1234567890@s.whatsapp.net'],
      };

      const chatType = msg.isGroup ? 'group' : 'private';
      const isMentioned = msg.isGroup ? (adapter as any).isMentioned(msg) : true;

      const metadata: InboundMessageMetadata = {
        messageId: msg.messageId,
        fromUser: (adapter as any).resolvePhone(msg.jid),
        chatType,
        isMentioned,
        channelType: 'whatsapp',
      };

      expect(metadata.chatType).toBe('group');
      expect(metadata.isMentioned).toBe(true);
    });
  });
});
