/**
 * Telegram API test fixtures — builders for TelegramUpdate, TelegramMessage, etc.
 * Based on real update shapes from long-polling logs.
 */

import type {
  TelegramUpdate,
  TelegramMessage,
  TelegramUser,
  TelegramChat,
} from '../types.js';

export const TELEGRAM_USERS = {
  OWNER: { id: 100001, is_bot: false, first_name: 'TestOwner', username: 'testowner_user' },
  PEER_BOT: { id: 200001, is_bot: true, first_name: 'PeerBot', username: 'PeerBotTest' },
  AGENT_BOT: { id: 200002, is_bot: true, first_name: 'AgentBot', username: 'AgentBotTest' },
  ALICE: { id: 1001, is_bot: false, first_name: 'Alice', username: 'alice_user' },
  BOB: { id: 1002, is_bot: false, first_name: 'Bob', username: 'bob_user' },
  CHARLIE: { id: 1003, is_bot: false, first_name: 'Charlie', username: 'charlie_user' },
};

export const TELEGRAM_CHATS = {
  PRIVATE_OWNER: { id: 100001, type: 'private' as const, first_name: 'TestOwner' },
  GROUP_TEST: {
    id: -100123456789,
    type: 'group' as const,
    title: 'TestGroup',
    all_members_are_administrators: false,
  },
};

/**
 * Builder for TelegramUser — sensible defaults, override as needed.
 */
export function buildTelegramUser(overrides?: Partial<TelegramUser>): TelegramUser {
  return {
    id: 1001,
    is_bot: false,
    first_name: 'TestUser',
    username: 'testuser',
    ...overrides,
  };
}

/**
 * Builder for TelegramChat — sensible defaults, override as needed.
 */
export function buildTelegramChat(overrides?: Partial<TelegramChat>): TelegramChat {
  return {
    id: 123456,
    type: 'private' as const,
    ...overrides,
  };
}

/**
 * Builder for TelegramMessage — sensible defaults, override as needed.
 */
export function buildTelegramMessage(overrides?: Partial<TelegramMessage>): TelegramMessage {
  return {
    message_id: 1,
    from: buildTelegramUser(),
    chat: buildTelegramChat(),
    date: Math.floor(Date.now() / 1000),
    text: 'Test message',
    ...overrides,
  };
}

/**
 * Builder for TelegramUpdate — sensible defaults, override as needed.
 */
export function buildTelegramUpdate(overrides?: Partial<TelegramUpdate>): TelegramUpdate {
  return {
    update_id: 1,
    message: buildTelegramMessage(),
    ...overrides,
  };
}

/**
 * Shortcuts for common test scenarios
 */
export const TelegramFixtures = {
  /**
   * Private chat message (always "mentioned" in logic)
   */
  privateMessage: (text = 'Hello', user = TELEGRAM_USERS.OWNER) =>
    buildTelegramUpdate({
      update_id: 100,
      message: buildTelegramMessage({
        message_id: 10,
        from: user,
        chat: buildTelegramChat({ id: user.id, type: 'private' }),
        text,
      }),
    }),

  /**
   * Group message with bot mention
   */
  groupMessageWithMention: (text = '@AgentBotTest hello', user = TELEGRAM_USERS.OWNER) =>
    buildTelegramUpdate({
      update_id: 200,
      message: buildTelegramMessage({
        message_id: 20,
        from: user,
        chat: buildTelegramChat({ ...TELEGRAM_CHATS.GROUP_TEST }),
        text,
      }),
    }),

  /**
   * Group message without mention (should be ignored in current handleUpdate)
   */
  groupMessageWithoutMention: (text = 'Hey guys', user = TELEGRAM_USERS.OWNER) =>
    buildTelegramUpdate({
      update_id: 201,
      message: buildTelegramMessage({
        message_id: 21,
        from: user,
        chat: buildTelegramChat({ ...TELEGRAM_CHATS.GROUP_TEST }),
        text,
      }),
    }),

  /**
   * Group message replying to bot message (counts as mention)
   */
  groupMessageReplyToBot: (text = 'That makes sense', user = TELEGRAM_USERS.OWNER, botId = TELEGRAM_USERS.AGENT_BOT.id) =>
    buildTelegramUpdate({
      update_id: 202,
      message: buildTelegramMessage({
        message_id: 22,
        from: user,
        chat: buildTelegramChat({ ...TELEGRAM_CHATS.GROUP_TEST }),
        text,
        reply_to_message: buildTelegramMessage({
          message_id: 19,
          from: buildTelegramUser({ id: botId, is_bot: true }),
          chat: buildTelegramChat({ ...TELEGRAM_CHATS.GROUP_TEST }),
          text: 'Bot response',
        }),
      }),
    }),

  /**
   * Message from bot itself (should be ignored by logic "if (msg.from?.id === this.botUser?.id) return;")
   */
  botOwnMessage: (text = 'Bot sending to itself', botId = TELEGRAM_USERS.AGENT_BOT.id) =>
    buildTelegramUpdate({
      update_id: 203,
      message: buildTelegramMessage({
        message_id: 23,
        from: buildTelegramUser({ id: botId, is_bot: true }),
        chat: buildTelegramChat({ ...TELEGRAM_CHATS.GROUP_TEST }),
        text,
      }),
    }),

  /**
   * Message with media (photo, voice, audio) — skips mention check
   */
  groupMessageWithPhoto: (user = TELEGRAM_USERS.OWNER, caption = 'Check this out') =>
    buildTelegramUpdate({
      update_id: 204,
      message: buildTelegramMessage({
        message_id: 24,
        from: user,
        chat: buildTelegramChat({ ...TELEGRAM_CHATS.GROUP_TEST }),
        text: undefined, // no text, has photo instead
        photo: [
          {
            file_id: 'photo_file_123',
            file_unique_id: 'unique_123',
            width: 1280,
            height: 720,
            file_size: 102400,
          },
        ],
        caption,
      }),
    }),

  /**
   * Empty update (no message) — should be ignored
   */
  emptyUpdate: () =>
    buildTelegramUpdate({
      update_id: 205,
      message: undefined,
    }),

  /**
   * Channel message (not private, not group/supergroup) — should be ignored
   */
  channelMessage: () =>
    buildTelegramUpdate({
      update_id: 206,
      message: buildTelegramMessage({
        message_id: 26,
        chat: buildTelegramChat({ id: -1001234567890, type: 'channel', title: 'Test Channel' }),
        text: 'Channel message',
      }),
    }),
};
