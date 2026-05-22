/**
 * Regression test: isMentionedInMessage must check msg.caption for document messages.
 *
 * In Telegram's API, documents/photos/audio sent with a caption put the user's
 * text in msg.caption, NOT msg.text. The normalizer's isMentionedInMessage()
 * must check both msg.text and msg.caption to detect @mentions.
 *
 * Fixed behavior:
 * - User sends PDF with caption "@botname read this" → bot IS mentioned
 * - skipAgent = false → agent processes the document
 * - Document content is extracted and available to the agent
 */
import { describe, it, expect } from 'vitest';
import { normalizeTelegramMessage } from '../normalizer.js';
import { buildTelegramMessage, buildTelegramUser, buildTelegramChat } from './fixtures.js';
import type { TelegramNormalizerContext } from '../normalizer.js';
import type { TelegramMessage } from '../types.js';

const BOT_CONTEXT: TelegramNormalizerContext = {
  botUserId: 200002,
  botUsername: 'AgentBotTest',
  botName: 'AgentBot',
};

function buildDocumentMessage(overrides?: Partial<TelegramMessage>): TelegramMessage {
  return buildTelegramMessage({
    from: buildTelegramUser({ id: 1001, is_bot: false, first_name: 'Alice', username: 'alice_user' }),
    chat: buildTelegramChat({ id: -100123456789, type: 'group' }),
    text: undefined, // Document messages have NO text field
    document: {
      file_name: 'report.pdf',
      mime_type: 'application/pdf',
      file_id: 'doc_file_123',
      file_unique_id: 'doc_unique_123',
      file_size: 50000,
    },
    caption: undefined, // Override in individual tests
    ...overrides,
  });
}

describe('normalizeTelegramMessage — document caption mentions', () => {
  it('document with @mention in caption IS detected as mentioned', () => {
    const msg = buildDocumentMessage({
      caption: '@AgentBotTest can you read this PDF?',
    });

    const result = normalizeTelegramMessage(msg, BOT_CONTEXT);

    expect(result).not.toBeNull();
    expect(result!.isMentioned).toBe(true);
    expect(result!.skipAgent).toBe(false);
  });

  it('document caption text is passed through as message text', () => {
    const msg = buildDocumentMessage({
      caption: '@AgentBotTest read this PDF',
    });

    const result = normalizeTelegramMessage(msg, BOT_CONTEXT);

    expect(result).not.toBeNull();
    expect(result!.text).toBe('@AgentBotTest read this PDF');
    expect(result!.isMentioned).toBe(true);
    expect(result!.skipAgent).toBe(false);
  });

  it('reply to bot with document still works (reply check unaffected)', () => {
    // Verify the reply-to-bot path is NOT broken — it doesn't depend on msg.text
    const msg = buildDocumentMessage({
      caption: 'Here is the PDF you asked for',
      reply_to_message: buildTelegramMessage({
        message_id: 99,
        from: buildTelegramUser({ id: 200002, is_bot: true, first_name: 'AgentBot' }),
        chat: buildTelegramChat({ id: -100123456789, type: 'group' }),
        text: 'Please send me the report',
      }),
    });

    const result = normalizeTelegramMessage(msg, BOT_CONTEXT);

    expect(result).not.toBeNull();
    // Reply check should still work — bot IS considered mentioned
    expect(result!.isMentioned).toBe(true);
    expect(result!.skipAgent).toBe(false);
  });

  it('document without mention or reply in group is correctly skipped', () => {
    // This is the correct behavior for a document sent with no mention
    const msg = buildDocumentMessage({
      caption: 'Check out this document everyone',
    });

    const result = normalizeTelegramMessage(msg, BOT_CONTEXT);

    expect(result).not.toBeNull();
    expect(result!.isMentioned).toBe(false);
    expect(result!.skipAgent).toBe(true);
  });

  it('private chat document is always treated as mentioned', () => {
    // Private chats should always work — the mention logic doesn't matter
    const msg = buildDocumentMessage({
      chat: buildTelegramChat({ id: 1001, type: 'private' }),
      caption: 'Read this PDF',
    });

    const result = normalizeTelegramMessage(msg, BOT_CONTEXT);

    expect(result).not.toBeNull();
    expect(result!.isMentioned).toBe(true);
    expect(result!.skipAgent).toBe(false);
    expect(result!.text).toBe('Read this PDF');
  });
});

describe('normalizeTelegramMessage — photo caption mentions', () => {
  function buildPhotoMessage(overrides?: Partial<TelegramMessage>): TelegramMessage {
    return buildTelegramMessage({
      from: buildTelegramUser({ id: 1001, is_bot: false, first_name: 'Alice', username: 'alice_user' }),
      chat: buildTelegramChat({ id: -100123456789, type: 'group' }),
      text: undefined,
      photo: [
        { file_id: 'photo_small', file_unique_id: 'unique_small', width: 320, height: 180 },
        { file_id: 'photo_large', file_unique_id: 'unique_large', width: 1280, height: 720, file_size: 102400 },
      ],
      caption: undefined,
      ...overrides,
    });
  }

  it('photo with @mention in caption IS detected as mentioned', () => {
    const msg = buildPhotoMessage({
      caption: '@AgentBotTest what is this?',
    });

    const result = normalizeTelegramMessage(msg, BOT_CONTEXT);

    expect(result).not.toBeNull();
    expect(result!.isMentioned).toBe(true);
    expect(result!.skipAgent).toBe(false);
    expect(result!.text).toBe('@AgentBotTest what is this?');
  });

  it('photo without mention in group is correctly skipped', () => {
    const msg = buildPhotoMessage({
      caption: 'Look at this sunset!',
    });

    const result = normalizeTelegramMessage(msg, BOT_CONTEXT);

    expect(result).not.toBeNull();
    expect(result!.isMentioned).toBe(false);
    expect(result!.skipAgent).toBe(true);
    expect(result!.text).toBe('Look at this sunset!');
  });

  it('photo reply to bot is detected as mentioned', () => {
    const msg = buildPhotoMessage({
      caption: 'Here is the screenshot',
      reply_to_message: buildTelegramMessage({
        message_id: 99,
        from: buildTelegramUser({ id: 200002, is_bot: true, first_name: 'AgentBot' }),
        chat: buildTelegramChat({ id: -100123456789, type: 'group' }),
        text: 'Can you send me a screenshot?',
      }),
    });

    const result = normalizeTelegramMessage(msg, BOT_CONTEXT);

    expect(result).not.toBeNull();
    expect(result!.isMentioned).toBe(true);
    expect(result!.skipAgent).toBe(false);
  });
});

describe('normalizeTelegramMessage — voice/audio caption mentions', () => {
  function buildVoiceMessage(overrides?: Partial<TelegramMessage>): TelegramMessage {
    return buildTelegramMessage({
      from: buildTelegramUser({ id: 1001, is_bot: false, first_name: 'Alice', username: 'alice_user' }),
      chat: buildTelegramChat({ id: -100123456789, type: 'group' }),
      text: undefined,
      voice: {
        file_id: 'voice_file_123',
        file_unique_id: 'voice_unique_123',
        duration: 10,
        mime_type: 'audio/ogg',
      },
      caption: undefined,
      ...overrides,
    });
  }

  it('voice message reply to bot is detected as mentioned', () => {
    const msg = buildVoiceMessage({
      reply_to_message: buildTelegramMessage({
        message_id: 99,
        from: buildTelegramUser({ id: 200002, is_bot: true, first_name: 'AgentBot' }),
        chat: buildTelegramChat({ id: -100123456789, type: 'group' }),
        text: 'Tell me more',
      }),
    });

    const result = normalizeTelegramMessage(msg, BOT_CONTEXT);

    expect(result).not.toBeNull();
    expect(result!.isMentioned).toBe(true);
    expect(result!.skipAgent).toBe(false);
  });

  it('voice message without mention in group is correctly skipped', () => {
    const msg = buildVoiceMessage({});

    const result = normalizeTelegramMessage(msg, BOT_CONTEXT);

    expect(result).not.toBeNull();
    expect(result!.isMentioned).toBe(false);
    expect(result!.skipAgent).toBe(true);
  });
});
