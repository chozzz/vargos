/**
 * Telegram message normalizer — converts Telegram adapter output to canonical form.
 */

import type { NormalizedInboundMessage } from '../../contracts.js';
import type { TelegramMessage } from './types.js';

export interface TelegramNormalizerContext {
  botUserId: number | null;
}

export function normalizeTelegramMessage(
  msg: TelegramMessage,
  context: TelegramNormalizerContext,
): NormalizedInboundMessage | null {
  // Ignore bot's own messages
  if (msg.from?.id === context.botUserId) {
    return null;
  }

  if (!msg.text && !msg.photo && !msg.voice && !msg.audio && !msg.document) {
    return null;
  }

  const chatType = msg.chat.type;
  const isPrivateChat = chatType === 'private';
  const isGroupChat = chatType === 'group' || chatType === 'supergroup';

  const isMentioned = isPrivateChat || isMentionedInMessage(msg, context.botUserId);

  return {
    messageId: String(msg.message_id),
    fromUserId: String(msg.from?.id || 0),
    fromUser: msg.from?.first_name || msg.from?.username || 'Unknown',
    chatType: isPrivateChat ? 'private' : 'group',
    isMentioned,
    channelType: 'telegram',
    skipAgent: isGroupChat && !isMentioned ? true : false,
    text: msg.text,
    media: undefined, // Media handling done separately
  };
}

function isMentionedInMessage(msg: TelegramMessage, botUserId: number | null): boolean {
  if (!msg.text || !botUserId) return false;

  // Check if message is a reply to the bot
  if (msg.reply_to_message?.from?.id === botUserId) {
    return true;
  }

  // Check if bot's username is mentioned with @ (e.g., @BotName)
  // Telegram usernames are alphanumeric + underscores, 5-32 chars
  // For now, we detect common mention patterns like @vargosbot, @VargosBot, etc.
  // The regex matches @word boundaries
  const mentionPattern = /@[\w]+/g;
  const mentions = msg.text.match(mentionPattern) || [];
  if (mentions.length > 0) {
    return true;
  }

  return false;
}
