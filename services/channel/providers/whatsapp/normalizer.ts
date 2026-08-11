/**
 * WhatsApp message normalizer — converts WhatsApp adapter output to canonical form.
 */

import { areJidsSameUser } from '@whiskeysockets/baileys';
import type { MediaKind, NormalizedInboundMessage } from '../../types.js';
import type { WhatsAppInboundMessage } from './types.js';

export interface WhatsAppNormalizerContext {
  botJid: string;
}

export function normalizeWhatsAppMessage(
  msg: WhatsAppInboundMessage,
  context: WhatsAppNormalizerContext,
): NormalizedInboundMessage | null {
  // Ignore the bot's own messages
  if (msg.fromMe) return null;
  if (!msg.text && !msg.mediaType) return null;

  return {
    messageId: msg.messageId,
    chatId: msg.sessionJid,        // group JID for groups, user JID for private
    fromUserId: msg.jid,           // sender, for whitelist checking
    chatType: msg.isGroup ? 'group' : 'private',
    isMentioned: msg.isGroup ? isMentionedInGroup(msg, context.botJid) : true,
    text: msg.text,
    mediaKind: toMediaKind(msg.mediaType),
  };
}

/** Stickers are images as far as saving and describing are concerned. */
function toMediaKind(mediaType: WhatsAppInboundMessage['mediaType']): MediaKind | undefined {
  if (!mediaType) return undefined;
  return mediaType === 'sticker' ? 'image' : mediaType;
}

function isMentionedInGroup(msg: WhatsAppInboundMessage, botJid: string): boolean {
  // areJidsSameUser handles @lid vs @s.whatsapp.net format differences
  if (msg.mentionedJids?.some(jid => areJidsSameUser(jid, botJid))) return true;

  // A reply to one of the bot's messages
  if (msg.quotedSenderJid && areJidsSameUser(msg.quotedSenderJid, botJid)) return true;

  // Fallback: mentionedJids is only populated when the sender used the mention menu.
  // Typing "@<number>" by hand leaves a bare number in the text, so treat that as a
  // mention too — deliberately loose, since the whitelist still gates execution.
  return !!msg.text && /@\d{5,}/.test(msg.text);
}
