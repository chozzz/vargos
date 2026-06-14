import { describe, it, expect } from 'vitest';
import { fixtures } from './fixtures/messages.js';

describe('WhatsApp Message Handling', () => {
  describe('ID Format Detection', () => {
    it('distinguishes phone number format (@s.whatsapp.net) from linked device (@lid)', () => {
      const pcMsg = fixtures.privateFromPC;
      const phoneMsg = fixtures.privateFromPhone;

      expect(pcMsg.jid).toMatch(/@s\.whatsapp\.net$/);
      expect(phoneMsg.jid).toMatch(/@lid$/);
    });

    it('handles same user with different JID formats across devices', () => {
      const pcMsg = fixtures.privateFromPC;
      const phoneMsg = fixtures.privateFromPhone;

      // Same user (61423222658) but different JIDs
      expect(pcMsg.jid).toBe('61423222658@s.whatsapp.net');
      expect(phoneMsg.jid).toBe('210994982838335@lid');
      // This is the core issue: how to map these?
    });
  });

  describe('Message Classification', () => {
    it('classifies private messages correctly', () => {
      const pcMsg = fixtures.privateFromPC;
      const phoneMsg = fixtures.privateFromPhone;

      expect(pcMsg.isGroup).toBe(false);
      expect(phoneMsg.isGroup).toBe(false);
    });

    it('classifies group messages correctly', () => {
      const groupMsg = fixtures.groupMessage;

      expect(groupMsg.isGroup).toBe(true);
      expect(groupMsg.text).toBeDefined();
    });

    it('detects mentions in group messages', () => {
      const mentionedMsg = fixtures.groupMessageMentioned;

      expect(mentionedMsg.isGroup).toBe(true);
      expect(mentionedMsg.mentionedJids).toBeDefined();
      expect(mentionedMsg.mentionedJids).toContain('176136675979485@lid');
    });
  });

  describe('JID Normalization for Whitelist', () => {
    it('normalizes @s.whatsapp.net format', () => {
      const jid = '61423222658@s.whatsapp.net';
      const normalized = jid.replace(/^\+/, '').replace(/@[^@]+$/, '');
      expect(normalized).toBe('61423222658');
    });

    it('normalizes @lid format', () => {
      const jid = '210994982838335@lid';
      const normalized = jid.replace(/^\+/, '').replace(/@[^@]+$/, '');
      expect(normalized).toBe('210994982838335');
    });

    it('handles + prefix removal', () => {
      const jid = '+61423222658@s.whatsapp.net';
      const normalized = jid.replace(/^\+/, '').replace(/@[^@]+$/, '');
      expect(normalized).toBe('61423222658');
    });
  });

  describe('Whitelist Matching Strategy', () => {
    it('matches full JID in whitelist (phone-based)', () => {
      const allowFrom = new Set(['61423222658@s.whatsapp.net']);
      const fromUserId = '61423222658@s.whatsapp.net';

      const isWhitelisted = allowFrom.has(fromUserId.replace(/^\+/, ''));
      expect(isWhitelisted).toBe(true);
    });

    it('matches full JID in whitelist (device-based)', () => {
      const allowFrom = new Set(['210994982838335@lid']);
      const fromUserId = '210994982838335@lid';

      const isWhitelisted = allowFrom.has(fromUserId.replace(/^\+/, ''));
      expect(isWhitelisted).toBe(true);
    });

    it('matches normalized numeric ID when full JID is in whitelist', () => {
      const allowFrom = new Set(['61423222658@s.whatsapp.net']);
      const fromUserId = '61423222658@s.whatsapp.net';
      const normalized = fromUserId.replace(/^\+/, '').replace(/@[^@]+$/, '');

      // Extract normalized from whitelist for comparison
      const whitelistNormalized = Array.from(allowFrom)
        .map(w => w.replace(/^\+/, '').replace(/@[^@]+$/, ''));

      expect(whitelistNormalized).toContain(normalized);
    });

    it('accepts both device formats for same user in config', () => {
      // Config with both formats for you
      const allowFrom = new Set([
        '61423222658@s.whatsapp.net', // From PC
        '210994982838335@lid',        // From phone
      ]);

      // Both messages should match
      expect(allowFrom.has('61423222658@s.whatsapp.net')).toBe(true);
      expect(allowFrom.has('210994982838335@lid')).toBe(true);
    });

    it('rejects user not in whitelist', () => {
      const allowFrom = new Set(['61423222658@s.whatsapp.net']);
      const fromUserId = '999999999999@lid';

      const isWhitelisted =
        allowFrom.has(fromUserId.replace(/^\+/, '')) ||
        allowFrom.has(fromUserId.replace(/^\+/, '').replace(/@[^@]+$/, ''));

      expect(isWhitelisted).toBe(false);
    });
  });

  describe('Group Message Sender Identification', () => {
    it('identifies sender in group message from JID', () => {
      const groupMsg = fixtures.groupMessage;
      const senderId = groupMsg.jid.replace(/@[^@]+$/, '');

      expect(senderId).toBe('210994982838335');
    });

    it('handles multiple senders in group (different @lid IDs)', () => {
      const sender1 = fixtures.groupMessage.jid;
      const sender2 = fixtures.groupMessageOtherUser.jid;

      expect(sender1).not.toBe(sender2);
      // Both have @lid but different numeric IDs
      expect(sender1).toMatch(/@lid$/);
      expect(sender2).toMatch(/@lid$/);
    });
  });
});
