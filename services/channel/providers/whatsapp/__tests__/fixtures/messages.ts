import type { WhatsAppInboundMessage } from '../../types.js';

/**
 * Real WhatsApp message fixtures from testing.
 *
 * Note: Same user (you) with two different JID formats:
 * - PC/Web: 61423222658@s.whatsapp.net (phone-based)
 * - Phone: 210994982838335@lid (device-linked ID)
 *
 * These are equivalent users but different device contexts.
 *
 * `jid` is the sender; `sessionJid` is the chat — the group JID for groups,
 * the sender's own JID for private chats. See session.ts.
 */
const GROUP_JID = '120363040000000000@g.us';

export const fixtures = {
  privateFromPC: {
    messageId: '3EB06A5F0A74836D82B181',
    jid: '61423222658@s.whatsapp.net',
    sessionJid: '61423222658@s.whatsapp.net',
    fromMe: false,
    isGroup: false,
    timestamp: 1777181873000,
    text: 'Test',
  } satisfies WhatsAppInboundMessage,

  privateFromPhone: {
    messageId: 'AC7F7FC291FF51CD94B895A5396CEF6E',
    jid: '210994982838335@lid',
    sessionJid: '210994982838335@lid',
    fromMe: false,
    isGroup: false,
    timestamp: 1777181897000,
    text: 'Phone',
  } satisfies WhatsAppInboundMessage,

  groupMessage: {
    messageId: 'AC0C070DAE81692A2FA63836732804C2',
    jid: '210994982838335@lid',
    sessionJid: GROUP_JID,
    fromMe: false,
    isGroup: true,
    timestamp: 1777181976000,
    text: 'Testtt',
  } satisfies WhatsAppInboundMessage,

  groupMessageOtherUser: {
    messageId: 'A54636611F6A9BE4920C88BE03919248',
    jid: '114074549493846@lid',
    sessionJid: GROUP_JID,
    fromMe: false,
    isGroup: true,
    timestamp: 1777181979000,
    text: 'Jln biasa lagi tp udah deket bk heni',
  } satisfies WhatsAppInboundMessage,

  groupMessageMentioned: {
    messageId: '3EB0395888D848183874E0',
    jid: '210994982838335@lid',
    sessionJid: GROUP_JID,
    fromMe: false,
    isGroup: true,
    timestamp: 1777182162000,
    mentionedJids: ['176136675979485@lid'],
    text: '@176136675979485 Hoyaaa',
  } satisfies WhatsAppInboundMessage,
};
