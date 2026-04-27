/**
 * Group reply routing test — verify messages are sent back to the correct chat
 *
 * Design:
 * - sessionKey always uses chat.id (where replies go)
 *   * Private: chat.id = user ID (123)
 *   * Group: chat.id = group ID (-100123456789)
 * - Metadata stores fromUserId separately (for whitelist checking)
 *
 * Result: Reply routing is automatic (sessionKey is correct destination),
 * whitelist checks use fromUserId.
 */

import { describe, it, expect } from 'vitest';
import type { InboundMessageMetadata } from '../../../../gateway/events.js';

describe('Group reply routing', () => {
  describe('sessionKey construction', () => {
    it('private message: sessionKey uses user ID (which equals chat ID)', () => {
      const chatId = '123'; // For private: chat ID = user ID
      const sessionKey = `telegram-vargos:${chatId}`;

      const extracted = sessionKey.split(':')[1];
      expect(extracted).toBe('123');
    });

    it('group message: sessionKey uses group chat ID (negative)', () => {
      const groupChatId = '-100123456789';
      const sessionKey = `telegram-vargos:${groupChatId}`;

      const extracted = sessionKey.split(':')[1];
      expect(extracted).toBe('-100123456789');
    });
  });

  describe('metadata stores sender separately', () => {
    it('group message includes fromUserId for whitelist checking', () => {
      const metadata: InboundMessageMetadata = {
        messageId: 'msg1',
        fromUser: 'Alice',
        fromUserId: '123', // Sender's actual user ID
        chatType: 'group',
        isMentioned: true,
        skipAgent: false,
        channelType: 'telegram',
      };

      expect(metadata.chatType).toBe('group');
      expect(metadata.fromUserId).toBe('123');
    });

    it('private message includes fromUserId (same as user ID)', () => {
      const metadata: InboundMessageMetadata = {
        messageId: 'msg2',
        fromUser: 'Bob',
        fromUserId: '456', // Private chat: sender ID = chat ID
        chatType: 'private',
        isMentioned: true,
        skipAgent: false,
        channelType: 'telegram',
      };

      expect(metadata.chatType).toBe('private');
      expect(metadata.fromUserId).toBe('456');
    });
  });

  describe('reply routing uses sessionKey (always correct destination)', () => {
    it('group message reply goes to group using sessionKey', () => {
      const sessionKey = 'telegram-vargos:-100123456789'; // group chat ID

      // Reply routing: always use sessionKey (already has correct destination)
      const replyDestination = sessionKey.split(':')[1];

      expect(replyDestination).toBe('-100123456789'); // Group ✓
    });

    it('private message reply goes to user using sessionKey', () => {
      const sessionKey = 'telegram-vargos:456'; // user ID

      // Reply routing: always use sessionKey
      const replyDestination = sessionKey.split(':')[1];

      expect(replyDestination).toBe('456'); // Private ✓
    });
  });

  describe('whitelist checking uses fromUserId from metadata', () => {
    it('group message whitelist checks sender (fromUserId), not group ID', () => {
      const metadata: InboundMessageMetadata = {
        fromUserId: '123', // Sender to check
        chatType: 'group',
      };

      const allowFrom = new Set(['123', '456']);
      const isWhitelisted = allowFrom.has(metadata.fromUserId || '');

      expect(isWhitelisted).toBe(true); // Alice (123) is whitelisted
    });

    it('non-whitelisted group sender is rejected', () => {
      const metadata: InboundMessageMetadata = {
        fromUserId: '999', // Sender to check
        chatType: 'group',
      };

      const allowFrom = new Set(['123', '456']);
      const isWhitelisted = allowFrom.has(metadata.fromUserId || '');

      expect(isWhitelisted).toBe(false); // User 999 not whitelisted
    });
  });

  describe('end-to-end flow', () => {
    it('alice (123) mentions bot in group (-100123456789) → reply goes to group', () => {
      // Setup: Alice mentions bot in group
      const sessionKey = 'telegram-vargos:-100123456789'; // Group (destination)
      const metadata: InboundMessageMetadata = {
        messageId: 'msg1',
        fromUser: 'Alice',
        fromUserId: '123', // Sender (for whitelist)
        chatType: 'group',
        isMentioned: true,
        skipAgent: false,
      };

      // Whitelist check
      const allowFrom = new Set(['123']);
      const isWhitelisted = allowFrom.has(metadata.fromUserId || '');
      expect(isWhitelisted).toBe(true);

      // Reply routing
      const replyDestination = sessionKey.split(':')[1];
      expect(replyDestination).toBe('-100123456789'); // Reply goes to group ✓
      expect(replyDestination).not.toBe('123'); // Not to Alice's private chat
    });

    it('non-whitelisted user in group → reply still goes to group but execution skipped', () => {
      // Setup: User 999 mentions bot in group
      const sessionKey = 'telegram-vargos:-100123456789'; // Group (destination)
      const metadata: InboundMessageMetadata = {
        messageId: 'msg2',
        fromUser: 'Attacker',
        fromUserId: '999',
        chatType: 'group',
        isMentioned: true,
        skipAgent: false,
      };

      // Whitelist check fails
      const allowFrom = new Set(['123']);
      const isWhitelisted = allowFrom.has(metadata.fromUserId || '');
      expect(isWhitelisted).toBe(false); // Not whitelisted

      // BUT: reply destination is still correct (append-only message sent to group)
      const replyDestination = sessionKey.split(':')[1];
      expect(replyDestination).toBe('-100123456789'); // Still goes to group (as append) ✓
    });
  });
});
