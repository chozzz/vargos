/**
 * WhatsApp message normalizer — converts WhatsApp adapter output to canonical form.
 */

import { areJidsSameUser } from '@whiskeysockets/baileys';
import type { MediaKind, NormalizedInboundMessage } from '../../types.js';
import type { WhatsAppInboundMessage } from './types.js';

export interface WhatsAppNormalizerContext {
  botJid: string;
  /** The bot's LID (when the account has one) — a hand-typed @<lid> also counts as a mention. */
  botLid?: string;
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
    isMentioned: msg.isGroup ? isMentionedInGroup(msg, context) : true,
    text: msg.text,
    mediaKind: toMediaKind(msg.mediaType),
  };
}

/** Stickers are images as far as saving and describing are concerned. */
function toMediaKind(mediaType: WhatsAppInboundMessage['mediaType']): MediaKind | undefined {
  if (!mediaType) return undefined;
  return mediaType === 'sticker' ? 'image' : mediaType;
}

function isMentionedInGroup(msg: WhatsAppInboundMessage, context: WhatsAppNormalizerContext): boolean {
  const { botJid, botLid } = context;

  // areJidsSameUser handles @lid vs @s.whatsapp.net format differences
  if (msg.mentionedJids?.some(jid => areJidsSameUser(jid, botJid))) return true;

  // A reply to one of the bot's messages
  if (msg.quotedSenderJid && areJidsSameUser(msg.quotedSenderJid, botJid)) return true;

  // Fallback: mentionedJids is only populated when the sender used the mention menu.
  // Hand-typing "@<number>" leaves a bare number in the text. Only treat it as a
  // mention when that number identifies the bot (its phone number or its LID) —
  // pinging another group member (@<other-number>) must NOT trigger the bot.
  const text = msg.text;
  if (!text) return false;
  const identities = [bareUser(botJid), bareUser(botLid)]
    .filter((u): u is string => !!u && /^\d+$/.test(u));
  return identities.some(id => new RegExp(`@${id}(?!\\d)`).test(text));
}

/** '6282123123373:28@s.whatsapp.net' → '6282123123373'; '176136675979485@lid' → '176136675979485' */
function bareUser(jid: string | undefined): string | undefined {
  if (!jid) return undefined;
  const user = jid.split('@')[0];
  return user.split(':')[0];
}
