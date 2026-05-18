/**
 * WhatsApp message normalizer — converts WhatsApp adapter output to canonical form.
 */

import { jidDecode, areJidsSameUser } from '@whiskeysockets/baileys';
import type { NormalizedInboundMessage } from '../../contracts.js';
import type { WhatsAppInboundMessage } from './types.js';

export interface WhatsAppNormalizerContext {
  botJid: string;
  botName?: string;
}

export function normalizeWhatsAppMessage(
  msg: WhatsAppInboundMessage,
  context: WhatsAppNormalizerContext,
): NormalizedInboundMessage | null {
  // Ignore bot's own messages
  if (msg.fromMe) {
    return null;
  }

  if (!msg.text && !msg.mediaType) {
    return null;
  }

  const chatType = msg.isGroup ? 'group' : 'private';
  const isMentioned = msg.isGroup ? isMentionedInGroup(msg, context.botJid) : true;

  return {
    messageId: msg.messageId,
    fromUserId: msg.jid, // Store JID for whitelist checking
    fromUser: msg.pushName || resolvePhoneFromJid(msg.jid),
    chatType,
    isMentioned,
    channelType: 'whatsapp',
    botUserId: context.botJid || undefined,
    botName: context.botName,
    skipAgent: msg.isGroup && !isMentioned ? true : false,
    text: msg.text,
    media: undefined, // Media handling done separately
  };
}

function isMentionedInGroup(msg: WhatsAppInboundMessage, botJid: string): boolean {
  // Check if bot was explicitly mentioned via areJidsSameUser
  // (handles @lid vs @s.whatsapp.net format differences)
  if (msg.mentionedJids?.some(jid => areJidsSameUser(jid, botJid))) {
    return true;
  }

  // Check if it's a reply to bot's message
  if (msg.quotedSenderJid && areJidsSameUser(msg.quotedSenderJid, botJid)) {
    return true;
  }

  return false;
}

function resolvePhoneFromJid(jid: string): string {
  // Use Baileys' jidDecode to extract user portion (handles @s.whatsapp.net, @lid, device suffixes, etc.)
  const decoded = jidDecode(jid);
  return decoded?.user || jid;
}
