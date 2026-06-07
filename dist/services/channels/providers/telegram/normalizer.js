/**
 * Telegram message normalizer — converts Telegram adapter output to canonical form.
 */
export function normalizeTelegramMessage(msg, context) {
    // Ignore bot's own messages
    if (msg.from?.id === context.botUserId) {
        return null;
    }
    if (!msg.text && !msg.photo && !msg.voice && !msg.audio && !msg.document) {
        return null;
    }
    const chatType = msg.chat.type;
    const isPrivateChat = chatType === 'private';
    const isMentioned = isPrivateChat || isMentionedInMessage(msg, context.botUserId, context.botUsername);
    // Use caption as fallback for media messages (documents, photos, audio, voice)
    const textContent = msg.text ?? msg.caption;
    return {
        messageId: String(msg.message_id),
        fromUserId: String(msg.from?.id || 0),
        fromUser: msg.from?.first_name || msg.from?.username || 'Unknown',
        fromUserHandle: msg.from?.username,
        chatType: isPrivateChat ? 'private' : 'group',
        isMentioned,
        channelType: 'telegram',
        botUserId: context.botUserId != null ? String(context.botUserId) : undefined,
        botName: context.botName,
        botHandle: context.botUsername,
        text: textContent,
        media: undefined, // Media handling done separately
    };
}
function isMentionedInMessage(msg, botUserId, botUsername) {
    if (!botUserId)
        return false;
    // Check if message is a reply to the bot
    if (msg.reply_to_message?.from?.id === botUserId) {
        return true;
    }
    // Check text content — use caption for media messages (documents, photos, etc.)
    const textContent = msg.text ?? msg.caption;
    if (!textContent)
        return false;
    // Check if this specific bot's username is mentioned with @
    if (botUsername) {
        const mentionPattern = /@[\w]+/g;
        const mentions = textContent.match(mentionPattern) || [];
        const botMentionPattern = new RegExp(`@${botUsername}\\b`, 'i');
        if (mentions.some(m => botMentionPattern.test(m))) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=normalizer.js.map