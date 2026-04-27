/**
 * WhatsApp message normalizer — converts WhatsApp adapter output to canonical form.
 */

import type { NormalizedInboundMessage } from '../../contracts.js';
import type { WhatsAppInboundMessage } from './types.js';

export interface WhatsAppNormalizerContext {
  botJid: string;
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
    fromUser: resolvePhoneFromJid(msg.jid),
    chatType,
    isMentioned,
    channelType: 'whatsapp',
    skipAgent: msg.isGroup && !isMentioned ? true : false,
    text: msg.text,
    media: undefined, // Media handling done separately
  };
}

function isMentionedInGroup(msg: WhatsAppInboundMessage, botJid: string): boolean {
  // Check if bot was explicitly mentioned
  if (msg.mentionedJids?.includes(botJid)) {
    return true;
  }

  // Check if it's a reply to bot's message
  if (msg.quotedSenderJid === botJid) {
    return true;
  }

  return false;
}

function resolvePhoneFromJid(jid: string): string {
  // Extract phone number from JID
  // Format: "614123456789@s.whatsapp.net" or "123456789@lid"
  if (jid.includes('@')) {
    return jid.split('@')[0];
  }
  return jid;
}
