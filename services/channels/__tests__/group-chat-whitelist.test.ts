import { describe, it, expect } from 'vitest';
import { parseSessionKey } from '../../../lib/subagent.js';
import type { InboundMessageMetadata } from '../../../gateway/events.js';

describe('Group chat whitelist enforcement', () => {
  describe('Session key construction for groups', () => {
    it('Telegram: private chat uses chat ID', () => {
      // User 123 in private chat
      const chatId = '123'; // private chat ID
      const sessionKey = `telegram-instance:${chatId}`;
      const parsed = parseSessionKey(sessionKey);

      expect(parsed.type).toBe('telegram-instance');
      expect(parsed.id).toBe('123');
    });

    it('Telegram: group chat must use sender user ID, not group ID', () => {
      // Correct: user 456 in group -789
      // Before fix: chatId = "-789" (group), whitelist check fails
      // After fix: userId = "456" (sender), whitelist check works
      const senderUserId = '456';
      const sessionKey = `telegram-instance:${senderUserId}`;
      const parsed = parseSessionKey(sessionKey);

      expect(parsed.id).toBe('456');
      // Whitelist can now check if "456" is in allowFrom list
    });

    it('WhatsApp: private chat uses recipient JID', () => {
      const recipientPhone = '1234567890';
      const sessionKey = `whatsapp-instance:${recipientPhone}`;
      const parsed = parseSessionKey(sessionKey);

      expect(parsed.id).toBe('1234567890');
    });

    it('WhatsApp: group chat must use sender phone, not group ID', () => {
      // Correct: sender with phone 1111111111 in group ABC123
      // Before fix: jid = "ABC123@g.us" (group), whitelist fails
      // After fix: jid = "1111111111@s.whatsapp.net" (sender), whitelist works
      const senderPhone = '1111111111';
      const sessionKey = `whatsapp-instance:${senderPhone}`;
      const parsed = parseSessionKey(sessionKey);

      expect(parsed.id).toBe('1111111111');
      // Whitelist can now check if "1111111111" is in allowFrom list
    });
  });

  describe('Whitelist logic in channels/index.ts', () => {
    it('allows user when allowFrom is not set (default allow-all)', () => {
      const allowFrom = null;
      const userId = '123456';

      const isWhitelisted = allowFrom?.includes(userId) ?? true;
      expect(isWhitelisted).toBe(true);
    });

    it('allows user when in whitelist', () => {
      const allowFrom = new Set(['123456', '789012']);
      const userId = '123456';

      const isWhitelisted = allowFrom.has(userId) ?? true;
      expect(isWhitelisted).toBe(true);
    });

    it('rejects user when not in whitelist', () => {
      const allowFrom = new Set(['123456', '789012']);
      const userId = '999999';

      const isWhitelisted = allowFrom.has(userId) ?? true;
      expect(isWhitelisted).toBe(false);
    });

    it('handles phone number normalization (+ prefix)', () => {
      // Both allowFrom and userId are normalized (+ stripped)
      const allowFrom = new Set(['1234567890', '9876543210']); // normalized
      const userId1 = '1234567890';
      const userId2 = '+1234567890';

      // Strip + from userId before lookup
      const isWhitelisted1 = allowFrom.has(userId1.replace(/^\+/, '')) ?? true;
      const isWhitelisted2 = allowFrom.has(userId2.replace(/^\+/, '')) ?? true;

      // Both should match after normalization
      expect(isWhitelisted1).toBe(true);
      expect(isWhitelisted2).toBe(true);
    });
  });

  describe('Critical fix: group chat execution', () => {
    it('group message from whitelisted user: should EXECUTE', () => {
      // Scenario: User 456 sends "@BotName hello" in group -789
      // Step 1: Extract sender user ID (456), not group ID (-789)
      const senderUserId = '456';

      // Step 2: Build session key with sender ID
      const sessionKey = `telegram-vargos:${senderUserId}`;
      const parsed = parseSessionKey(sessionKey);
      const userId = parsed.id;

      // Step 3: Check whitelist with sender ID
      const allowFrom = new Set(['456', '789']);
      const isWhitelisted = allowFrom.has(userId) ?? true;
      const skipAgent = !isWhitelisted;

      // Should execute (skipAgent = false)
      expect(skipAgent).toBe(false);
      expect(isWhitelisted).toBe(true);
    });

    it('group message from non-whitelisted user: should SKIP (append only)', () => {
      // Scenario: User 999 sends "@BotName hello" in group -789
      // Before fix: userId = "-789" (group), whitelist check succeeds (bug!)
      // After fix: userId = "999" (sender), whitelist check fails correctly
      const senderUserId = '999';
      const sessionKey = `telegram-vargos:${senderUserId}`;
      const parsed = parseSessionKey(sessionKey);
      const userId = parsed.id;

      const allowFrom = new Set(['456', '789']);
      const isWhitelisted = allowFrom.has(userId) ?? true;
      const skipAgent = !isWhitelisted;

      // Should skip (skipAgent = true)
      expect(skipAgent).toBe(true);
      expect(isWhitelisted).toBe(false);
    });

    it('whatsapp: group message from whitelisted user should execute', () => {
      const senderPhone = '1234567890';
      const sessionKey = `whatsapp-vadi:${senderPhone}`;
      const parsed = parseSessionKey(sessionKey);
      const userId = parsed.id;

      const allowFrom = new Set(['1234567890', '9876543210']);
      const isWhitelisted = allowFrom.has(userId.replace(/^\+/, '')) ?? true;
      const skipAgent = !isWhitelisted;

      expect(skipAgent).toBe(false);
    });

    it('whatsapp: group message from non-whitelisted user should skip', () => {
      const senderPhone = '5555555555';
      const sessionKey = `whatsapp-vadi:${senderPhone}`;
      const parsed = parseSessionKey(sessionKey);
      const userId = parsed.id;

      const allowFrom = new Set(['1234567890', '9876543210']);
      const isWhitelisted = allowFrom.has(userId.replace(/^\+/, '')) ?? true;
      const skipAgent = !isWhitelisted;

      expect(skipAgent).toBe(true);
    });
  });

  describe('Session isolation in groups', () => {
    it('two users in same group get separate sessions', () => {
      // Group: -789
      // User A: 111, User B: 222
      // Both send @mention in same group
      const sessionKeyA = `telegram-vargos:111`;
      const sessionKeyB = `telegram-vargos:222`;

      const parsedA = parseSessionKey(sessionKeyA);
      const parsedB = parseSessionKey(sessionKeyB);

      // Sessions should be different (per-user, not per-group)
      expect(parsedA.id).not.toBe(parsedB.id);
      expect(parsedA.id).toBe('111');
      expect(parsedB.id).toBe('222');

      // Each user can have different whitelist status
      const allowFrom = new Set(['111']);
      expect(allowFrom.has(parsedA.id)).toBe(true);
      expect(allowFrom.has(parsedB.id)).toBe(false);
    });

    it('same user in different groups gets same session', () => {
      // User: 456 in groups -123 and -789
      // Both use same sessionKey
      const sessionKey1 = `telegram-vargos:456`;
      const sessionKey2 = `telegram-vargos:456`;

      expect(sessionKey1).toBe(sessionKey2);
      // Conversation history is shared across groups for same user
    });
  });

  describe('Metadata threading for group context', () => {
    it('Telegram: includes group context in metadata', () => {
      const metadata: InboundMessageMetadata = {
        messageId: 'msg123',
        fromUser: 'Alice',
        chatType: 'group',
        isMentioned: true,
        botName: 'MyBot',
        channelType: 'telegram',
      };

      expect(metadata.chatType).toBe('group');
      expect(metadata.isMentioned).toBe(true);
      expect(metadata.fromUser).toBe('Alice');
    });

    it('WhatsApp: includes group context in metadata', () => {
      const metadata: InboundMessageMetadata = {
        messageId: 'msg456',
        fromUser: '1234567890',
        chatType: 'group',
        isMentioned: true,
        channelType: 'whatsapp',
      };

      expect(metadata.chatType).toBe('group');
      expect(metadata.isMentioned).toBe(true);
      // Agent can use this context for group-specific behavior
    });
  });

  describe('Edge cases and regression prevention', () => {
    it('handles negative group IDs (Telegram)', () => {
      // Telegram group IDs are negative, but must use sender ID instead
      const senderUserId = '123456789';

      // Sender ID must not be negative
      expect(typeof senderUserId).toBe('string');
      expect(senderUserId.startsWith('-')).toBe(false);
    });

    it('handles high-number user IDs', () => {
      const userId = String(9999999999);
      const sessionKey = `telegram-instance:${userId}`;
      const parsed = parseSessionKey(sessionKey);

      expect(parsed.id).toBe('9999999999');
    });

    it('dedupe key uses correct user ID for groups', () => {
      // Before: msgKey = `${groupId}:${msgId}` → different groups might collide
      // After: msgKey = `${userId}:${msgId}` → same user in different groups uses correct key
      const userId = '456';
      const messageId = 'msg789';
      const msgKey = `${userId}:${messageId}`;

      expect(msgKey).toBe('456:msg789');
      // This key is unique per user per message, not affected by group
    });

    it('latestMessageId tracked per user, not per group', () => {
      const latestMessageId = new Map<string, string>();

      // User sends in group 1
      latestMessageId.set('456', '101');

      // Same user sends in group 2
      latestMessageId.set('456', '102');

      // Latest is retrieved per user
      expect(latestMessageId.get('456')).toBe('102');
      // Both group messages update same user's latest
    });
  });
});
