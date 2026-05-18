import { describe, it, expect } from 'vitest';
import { normalizeWhatsAppMessage } from '../normalizer.js';
import type { WhatsAppInboundMessage } from '../types.js';

/** Simulates Baileys jidDecode for test assertions */
function extractUserForTest(jid: string): string {
  const atIdx = jid.indexOf('@');
  if (atIdx === -1) return jid;
  const userPart = jid.slice(0, atIdx);
  const colonIdx = userPart.indexOf(':');
  return colonIdx === -1 ? userPart : userPart.slice(0, colonIdx);
}

describe('WhatsApp normalizer — metadata building', () => {
  const botJid = '1234567890@s.whatsapp.net';

  describe('private messages', () => {
    it('private messages are always mentioned (always relevant)', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: '1111111111@s.whatsapp.net',
        text: 'Hello',
        fromMe: false,
        isGroup: false,
        timestamp: Date.now(),
      };

      const result = normalizeWhatsAppMessage(msg, { botJid });
      expect(result).not.toBeNull();
      expect(result!.isMentioned).toBe(true);
      expect(result!.chatType).toBe('private');
      expect(result!.skipAgent).toBe(false);
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
        mentionedJids: [botJid, '9999999999@s.whatsapp.net'],
      };

      const result = normalizeWhatsAppMessage(msg, { botJid });
      expect(result!.isMentioned).toBe(true);
      expect(result!.skipAgent).toBe(false);
    });

    it('skips group messages without bot mention', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: 'group123@g.us',
        text: 'Hey everyone',
        fromMe: false,
        isGroup: true,
        timestamp: Date.now(),
        mentionedJids: ['9999999999@s.whatsapp.net'],
      };

      const result = normalizeWhatsAppMessage(msg, { botJid });
      expect(result!.skipAgent).toBe(true);
    });

    it('detects reply to bot message', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: 'group123@g.us',
        text: 'That makes sense',
        fromMe: false,
        isGroup: true,
        timestamp: Date.now(),
        quotedSenderJid: botJid,
      };

      const result = normalizeWhatsAppMessage(msg, { botJid });
      expect(result!.isMentioned).toBe(true);
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

      const result = normalizeWhatsAppMessage(msg, { botJid });
      expect(result!.skipAgent).toBe(true);
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

      const result = normalizeWhatsAppMessage(msg, { botJid });
      expect(result!.skipAgent).toBe(true);
    });

    it('detects bot mention across JID formats (areJidsSameUser)', () => {
      // Bot is @s.whatsapp.net, but mention comes in as @lid format
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: 'group123@g.us',
        text: '@bot help',
        fromMe: false,
        isGroup: true,
        timestamp: Date.now(),
        // Different JID format — same user via areJidsSameUser
        mentionedJids: [botJid],
      };

      const result = normalizeWhatsAppMessage(msg, { botJid });
      expect(result!.isMentioned).toBe(true);
    });

    it('detects quoted reply across JID formats', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: 'group123@g.us',
        text: 'Thanks',
        fromMe: false,
        isGroup: true,
        timestamp: Date.now(),
        quotedSenderJid: botJid, // Same format as botJid
      };

      const result = normalizeWhatsAppMessage(msg, { botJid });
      expect(result!.isMentioned).toBe(true);
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

      const result = normalizeWhatsAppMessage(msg, { botJid });
      expect(result!.skipAgent).toBe(true);
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

      const result = normalizeWhatsAppMessage(msg, { botJid });
      expect(result!.skipAgent).toBe(true);
    });

    it('handles mention without botJid set', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: 'group123@g.us',
        text: 'Hello',
        fromMe: false,
        isGroup: true,
        timestamp: Date.now(),
        mentionedJids: [botJid],
      };

      const result = normalizeWhatsAppMessage(msg, { botJid: '' });
      expect(result!.skipAgent).toBe(true);
    });

    it('skips own messages (fromMe)', () => {
      const msg: WhatsAppInboundMessage = {
        messageId: 'msg123',
        jid: '1111111111@s.whatsapp.net',
        text: 'Hello',
        fromMe: true,
        isGroup: false,
        timestamp: Date.now(),
      };

      const result = normalizeWhatsAppMessage(msg, { botJid });
      expect(result).toBeNull();
    });
  });

  describe('JID extraction', () => {
    it('extracts user from @s.whatsapp.net JID', () => {
      expect(extractUserForTest('1234567890@s.whatsapp.net')).toBe('1234567890');
    });

    it('extracts user from @lid JID', () => {
      expect(extractUserForTest('2222222222@lid')).toBe('2222222222');
    });

    it('strips device suffix from multi-device JID', () => {
      expect(extractUserForTest('3333333333:10@s.whatsapp.net')).toBe('3333333333');
      expect(extractUserForTest('4444444444:0@s.whatsapp.net')).toBe('4444444444');
    });

    it('extracts user from @g.us group JID', () => {
      expect(extractUserForTest('120363040000000000@g.us')).toBe('120363040000000000');
    });
  });
});
