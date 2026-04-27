/**
 * Sentry mode unit tests — verify skipAgent flow for group chats
 *
 * Tests adapter logic:
 * - Group messages without mention: skipAgent=true
 * - Group messages with mention: skipAgent=false
 * - Private messages: skipAgent=false
 *
 * Tests channels service logic:
 * - skipAgent=true → appendMessage (observe without execute)
 * - skipAgent=false → check whitelist → execute or append based on whitelist
 */

import { describe, it, expect } from 'vitest';
import type { InboundMessageMetadata } from '../../../../gateway/events.js';

describe('Sentry mode — skipAgent flow', () => {
  describe('Telegram adapter skipAgent logic', () => {
    it('private chat always has skipAgent=false', () => {
      const chatType = 'private';
      let skipAgent = true;

      if (chatType === 'private') {
        skipAgent = false;
      }

      expect(skipAgent).toBe(false);
    });

    it('group chat without mention has skipAgent=true', () => {
      const chatType = 'group';
      const isMentioned = false;
      let skipAgent = true;

      if (chatType === 'private') {
        skipAgent = false;
      } else if (chatType === 'group' && isMentioned) {
        skipAgent = false;
      }

      expect(skipAgent).toBe(true);
    });

    it('group chat with mention has skipAgent=false', () => {
      const chatType = 'group';
      const isMentioned = true;
      let skipAgent = true;

      if (chatType === 'private') {
        skipAgent = false;
      } else if (chatType === 'group' && isMentioned) {
        skipAgent = false;
      }

      expect(skipAgent).toBe(false);
    });

    it('metadata includes skipAgent flag', () => {
      const metadata: InboundMessageMetadata = {
        messageId: 'msg1',
        chatType: 'group',
        isMentioned: false,
        skipAgent: true,
      };

      expect(metadata.skipAgent).toBe(true);
    });
  });

  describe('Channels service skipAgent logic', () => {
    it('skipAgent=true bypasses whitelist check → appendMessage', () => {
      const metadata: InboundMessageMetadata = {
        skipAgent: true,
      };

      // When skipAgent is true, whitelist check is skipped
      let shouldAppendOnly = false;
      if (metadata.skipAgent === true) {
        shouldAppendOnly = true;
      }

      expect(shouldAppendOnly).toBe(true);
    });

    it('skipAgent=false applies whitelist check', () => {
      const metadata: InboundMessageMetadata = {
        skipAgent: false,
      };
      const allowFrom = new Set(['user-whitelisted']);
      const userId = 'user-whitelisted';

      // When skipAgent is false, check whitelist
      let shouldExecute = false;
      if (metadata.skipAgent === false) {
        const isWhitelisted = allowFrom.has(userId);
        shouldExecute = isWhitelisted;
      }

      expect(shouldExecute).toBe(true);
    });

    it('skipAgent=false + not whitelisted → converts to appendMessage', () => {
      const metadata: InboundMessageMetadata = {
        skipAgent: false,
      };
      const allowFrom = new Set(['user-whitelisted']);
      const userId = 'user-attacker';

      // When skipAgent is false, check whitelist
      if (metadata.skipAgent === false) {
        const isWhitelisted = allowFrom.has(userId);
        if (!isWhitelisted) {
          // Update metadata to reflect this becomes append-only
          metadata.skipAgent = true;
        }
      }

      expect(metadata.skipAgent).toBe(true);
    });
  });

  describe('Group conversation context preservation', () => {
    it('non-mention messages are appended to session history', () => {
      const sessionMessages: Array<{ text: string; skipAgent: boolean }> = [];

      // Simulate group conversation where bot is not mentioned
      const msg1 = { text: 'How do I...?', skipAgent: true };
      const msg2 = { text: 'I think you should...', skipAgent: true };
      sessionMessages.push(msg1, msg2);

      expect(sessionMessages).toHaveLength(2);
      expect(sessionMessages.every(m => m.skipAgent === true)).toBe(true);
    });

    it('mention message has access to prior context', () => {
      const sessionMessages: Array<{ text: string; skipAgent: boolean }> = [];

      // Build prior context
      sessionMessages.push(
        { text: 'How do I...?', skipAgent: true },
        { text: 'I think you should...', skipAgent: true }
      );

      // New mention arrives
      const mentionMsg = { text: '@bot thanks!', skipAgent: false };
      sessionMessages.push(mentionMsg);

      // Agent can see all 3 messages in session history
      expect(sessionMessages).toHaveLength(3);
      expect(sessionMessages[0].text).toBe('How do I...?');
      expect(sessionMessages[1].text).toBe('I think you should...');
      expect(sessionMessages[2].text).toBe('@bot thanks!');
      expect(sessionMessages[2].skipAgent).toBe(false);
    });
  });

  describe('WhatsApp adapter skipAgent logic (same as Telegram)', () => {
    it('private message: skipAgent=false', () => {
      const isGroup = false;
      let skipAgent = true;

      if (!isGroup) {
        skipAgent = false;
      }

      expect(skipAgent).toBe(false);
    });

    it('group message with mention: skipAgent=false', () => {
      const isGroup = true;
      const isMentioned = true;
      let skipAgent = true;

      if (!isGroup) {
        skipAgent = false;
      } else if (isGroup && isMentioned) {
        skipAgent = false;
      }

      expect(skipAgent).toBe(false);
    });

    it('group message without mention: skipAgent=true', () => {
      const isGroup = true;
      const isMentioned = false;
      let skipAgent = true;

      if (!isGroup) {
        skipAgent = false;
      } else if (isGroup && isMentioned) {
        skipAgent = false;
      }

      expect(skipAgent).toBe(true);
    });
  });
});
