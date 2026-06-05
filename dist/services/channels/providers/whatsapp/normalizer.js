/**
 * WhatsApp message normalizer — converts WhatsApp adapter output to canonical form.
 */
import { jidDecode, areJidsSameUser } from '@whiskeysockets/baileys';
export function normalizeWhatsAppMessage(msg, context) {
    // Ignore bot's own messages
    if (msg.fromMe) {
        return null;
    }
    if (!msg.text && !msg.mediaType) {
        return null;
    }
    const chatType = msg.isGroup ? 'group' : 'private';
    const isMentioned = msg.isGroup ? isMentionedInGroup(msg, context.botJid, context.botLid) : true;
    return {
        messageId: msg.messageId,
        fromUserId: msg.jid, // Store JID for whitelist checking
        fromUser: msg.pushName || resolvePhoneFromJid(msg.jid),
        chatType,
        isMentioned,
        channelType: 'whatsapp',
        botUserId: context.botJid || undefined,
        botName: context.botName,
        text: msg.text,
        media: undefined, // Media handling done separately
    };
}
function isMentionedInGroup(msg, botJid, _botLid) {
    // Check if bot was explicitly mentioned via areJidsSameUser
    // (handles @lid vs @s.whatsapp.net format differences)
    if (msg.mentionedJids?.some(jid => areJidsSameUser(jid, botJid))) {
        return true;
    }
    // Check if it's a reply to bot's message
    if (msg.quotedSenderJid && areJidsSameUser(msg.quotedSenderJid, botJid)) {
        return true;
    }
    // Fallback: check for @number patterns in text.
    // When user types @Name in WhatsApp, the raw text contains @<number> (PN or LID).
    // mentionedJids is only populated when using the proper mention menu.
    // So we detect @number in text and treat it as a mention for whitelisted users.
    if (msg.text && /@\d{5,}/.test(msg.text)) {
        return true;
    }
    return false;
}
function resolvePhoneFromJid(jid) {
    // Use Baileys' jidDecode to extract user portion (handles @s.whatsapp.net, @lid, device suffixes, etc.)
    const decoded = jidDecode(jid);
    return decoded?.user || jid;
}
//# sourceMappingURL=normalizer.js.map