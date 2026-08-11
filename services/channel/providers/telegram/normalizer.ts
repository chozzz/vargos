/**
 * Telegram message normalizer — converts a raw Telegram message to canonical form.
 */

import type { MediaKind, NormalizedInboundMessage } from '../../types.js';
import type { TelegramMessage } from './types.js';

export interface TelegramNormalizerContext {
  botUserId: number | null;
  botUsername?: string;
}

export function normalizeTelegramMessage(
  msg: TelegramMessage,
  context: TelegramNormalizerContext,
): NormalizedInboundMessage | null {
  // Ignore the bot's own messages
  if (msg.from?.id === context.botUserId) return null;

  const mediaKind = detectMediaKind(msg);
  if (!msg.text && !mediaKind) return null;

  const isPrivateChat = msg.chat.type === 'private';

  return {
    messageId: String(msg.message_id),
    chatId: String(msg.chat.id),
    fromUserId: String(msg.from?.id || 0),
    chatType: isPrivateChat ? 'private' : 'group',
    isMentioned: isPrivateChat || isMentionedInMessage(msg, context.botUserId, context.botUsername),
    // Captions double as text for media messages
    text: msg.text ?? msg.caption,
    mediaKind,
  };
}

function detectMediaKind(msg: TelegramMessage): MediaKind | undefined {
  if (msg.photo?.length) return 'image';
  if (msg.voice || msg.audio) return 'audio';
  if (msg.document) return 'document';
  return undefined;
}

function isMentionedInMessage(msg: TelegramMessage, botUserId: number | null, botUsername?: string): boolean {
  if (!botUserId) return false;

  if (msg.reply_to_message?.from?.id === botUserId) return true;

  const textContent = msg.text ?? msg.caption;
  if (!textContent || !botUsername) return false;

  const mentions = textContent.match(/@[\w]+/g) || [];
  const botMention = new RegExp(`@${botUsername}\\b`, 'i');
  return mentions.some(m => botMention.test(m));
}
