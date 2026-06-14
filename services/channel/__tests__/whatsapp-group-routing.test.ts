/**
 * WhatsApp group routing and whitelist tests
 * Prevents regressions in: group reply routing, private chat flow, allowFrom semantics
 */

import { describe, expect, it } from 'vitest';
import type { NormalizedInboundMessage } from '../types.js';
import type { WhatsAppInboundMessage } from '../providers/whatsapp/types.js';
import { normalizeWhatsAppMessage } from '../providers/whatsapp/normalizer.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createWhatsAppMessage(opts: {
  senderJid?: string;
  groupJid?: string;
  text?: string;
  isGroup?: boolean;
  mentionedJids?: string[];
  quotedSenderJid?: string;
}): WhatsAppInboundMessage {
  const senderJid = opts.senderJid || '210994982838335@lid';
  const groupJid = opts.groupJid || '120363426286921624@g.us';
  const isGroup = opts.isGroup ?? false;

  return {
    messageId: 'msg_123',
    jid: senderJid,
    sessionJid: isGroup ? groupJid : senderJid,
    text: opts.text || 'hello',
    fromMe: false,
    isGroup,
    timestamp: Date.now(),
    pushName: 'Test User',
    mentionedJids: opts.mentionedJids,
    quotedSenderJid: opts.quotedSenderJid,
  };
}

function createNormalizedMessage(opts: {
  userId?: string;
  chatType?: string;
  isMentioned?: boolean;
  text?: string;
}): NormalizedInboundMessage {
  return {
    messageId: 'msg_123',
    fromUserId: opts.userId || '210994982838335@lid',
    fromUser: 'Test User',
    chatType: opts.chatType || 'group',
    isMentioned: opts.isMentioned ?? false,
    channelType: 'whatsapp',
    text: opts.text || 'hello',
    media: undefined,
  };
}

// Stub adapter for pipeline tests
class StubAdapter implements ChannelAdapter {
  readonly type = 'stub' as const;
  readonly instanceId = 'stub-test';
  readonly allowFrom: string[] | undefined;

  sent: Array<{ sessionKey: string; text: string }> = [];
  typingStarted: Array<{ sessionKey: string }> = [];
  typingStopped: Array<{ sessionKey: string; final?: boolean }> = [];
  reactCalls: Array<{ recipientId: string; messageId: string; emoji: string }> = [];

  constructor(allowFrom?: string[]) {
    this.allowFrom = allowFrom;
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async send(sessionKey: string, text: string): Promise<void> {
    this.sent.push({ sessionKey, text });
  }
  protected async sendTypingIndicator(sessionKey: string): Promise<void> {
    this.typingStarted.push({ sessionKey });
  }
  async startTyping(sessionKey: string, _isGroup: boolean): Promise<void> {
    this.typingStarted.push({ sessionKey });
  }
  async stopTyping(sessionKey: string, isFinal?: boolean): Promise<void> {
    this.typingStopped.push({ sessionKey, final: isFinal });
  }
  async react(recipientId: string, messageId: string, emoji: string): Promise<void> {
    this.reactCalls.push({ recipientId, messageId, emoji });
  }
  shouldExecute(userId: string, chatType: string, isMentioned: boolean): boolean {
    // Replicate BaseChannelAdapter.shouldExecute logic
    if (this.allowFrom === undefined) return true;
    const normalizedUser = userId.replace(/^\+/, '').replace(/@[^@]+$/, '');
    const fullJidNoPlus = userId.replace(/^\+/, '');
    const isWhitelisted = this.allowFrom.some(entry => {
      const normalizedEntry = entry.replace(/^\+/, '');
      return fullJidNoPlus === normalizedEntry || normalizedUser === normalizedEntry;
    });
    if (!isWhitelisted) return false;
    if (chatType === 'private') return true;
    return isMentioned;
  }
  extractLatestMessageId(_userId: string): string | undefined {
    return 'msg_latest';
  }
}

// ── Normalizer: group mention detection ──────────────────────────────────────

describe('WhatsApp normalizer: group mention detection', () => {
  const context = {
    botJid: '6282123123373@s.whatsapp.net',
    botName: 'TestBot',
  };

  it('marks private messages as mentioned (always true)', () => {
    const msg = createWhatsAppMessage({ isGroup: false, text: 'hello' });
    const result = normalizeWhatsAppMessage(msg, context);
    expect(result).not.toBeNull();
    expect(result!.isMentioned).toBe(true);
    expect(result!.chatType).toBe('private');
  });

  it('marks group messages as NOT mentioned when no @number in text', () => {
    const msg = createWhatsAppMessage({
      isGroup: true,
      text: 'hey everyone how are you',
    });
    const result = normalizeWhatsAppMessage(msg, context);
    expect(result).not.toBeNull();
    expect(result!.isMentioned).toBe(false);
    expect(result!.chatType).toBe('group');
  });

  it('marks group messages as mentioned when @number pattern present', () => {
    const msg = createWhatsAppMessage({
      isGroup: true,
      text: '@176136675979485 hellooo',
    });
    const result = normalizeWhatsAppMessage(msg, context);
    expect(result).not.toBeNull();
    expect(result!.isMentioned).toBe(true);
  });

  it('marks group messages as mentioned when @number at start of text', () => {
    const msg = createWhatsAppMessage({
      isGroup: true,
      text: '@6282123123373 whatsup',
    });
    const result = normalizeWhatsAppMessage(msg, context);
    expect(result).not.toBeNull();
    expect(result!.isMentioned).toBe(true);
  });

  it('marks group messages as mentioned when @number mid-text', () => {
    const msg = createWhatsAppMessage({
      isGroup: true,
      text: 'hey @176136675979485 can you help?',
    });
    const result = normalizeWhatsAppMessage(msg, context);
    expect(result).not.toBeNull();
    expect(result!.isMentioned).toBe(true);
  });

  it('does NOT mark as mentioned for short @numbers (<5 digits)', () => {
    const msg = createWhatsAppMessage({
      isGroup: true,
      text: 'hey @123 help',
    });
    const result = normalizeWhatsAppMessage(msg, context);
    expect(result).not.toBeNull();
    expect(result!.isMentioned).toBe(false);
  });

  it('marks as mentioned when mentionedJids contains bot JID', () => {
    const msg = createWhatsAppMessage({
      isGroup: true,
      text: 'hello',
      mentionedJids: ['6282123123373@s.whatsapp.net'],
    });
    const result = normalizeWhatsAppMessage(msg, context);
    expect(result).not.toBeNull();
    expect(result!.isMentioned).toBe(true);
  });

  it('marks as mentioned when quotedSenderJid matches bot', () => {
    const msg = createWhatsAppMessage({
      isGroup: true,
      text: 'reply to bot',
      quotedSenderJid: '6282123123373@s.whatsapp.net',
    });
    const result = normalizeWhatsAppMessage(msg, context);
    expect(result).not.toBeNull();
    expect(result!.isMentioned).toBe(true);
  });

  it('preserves sender JID in fromUserId for whitelist checks', () => {
    const msg = createWhatsAppMessage({
      isGroup: true,
      senderJid: '210994982838335@lid',
      groupJid: '120363426286921624@g.us',
      text: '@176136675979485 hello',
    });
    const result = normalizeWhatsAppMessage(msg, context);
    expect(result).not.toBeNull();
    expect(result!.fromUserId).toBe('210994982838335@lid');
  });

  it('uses sessionJid (group JID) for group messages', () => {
    const msg = createWhatsAppMessage({
      isGroup: true,
      senderJid: '210994982838335@lid',
      groupJid: '120363426286921624@g.us',
      text: '@176136675979485 hello',
    });
    expect(msg.sessionJid).toBe('120363426286921624@g.us');
  });

  it('uses sessionJid (user JID) for private messages', () => {
    const msg = createWhatsAppMessage({
      isGroup: false,
      senderJid: '210994982838335@lid',
      text: 'hello',
    });
    expect(msg.sessionJid).toBe('210994982838335@lid');
  });
});

// ── shouldExecute: whitelist + mention logic ─────────────────────────────────

describe('shouldExecute: whitelist + mention logic', () => {
  it('allows all when allowFrom is undefined (not configured)', () => {
    const adapter = new StubAdapter(undefined);
    expect(adapter.shouldExecute('anyone@lid', 'private', false)).toBe(true);
    expect(adapter.shouldExecute('anyone@lid', 'group', false)).toBe(true);
    expect(adapter.shouldExecute('anyone@lid', 'group', true)).toBe(true);
  });

  it('blocks all when allowFrom is empty array', () => {
    const adapter = new StubAdapter([]);
    expect(adapter.shouldExecute('anyone@lid', 'private', false)).toBe(false);
    expect(adapter.shouldExecute('anyone@lid', 'group', true)).toBe(false);
  });

  it('allows whitelisted user in private chat (no mention needed)', () => {
    const adapter = new StubAdapter(['210994982838335']);
    expect(adapter.shouldExecute('210994982838335@lid', 'private', false)).toBe(true);
  });

  it('blocks non-whitelisted user in private chat', () => {
    const adapter = new StubAdapter(['210994982838335']);
    expect(adapter.shouldExecute('99999999999999@lid', 'private', false)).toBe(false);
  });

  it('allows whitelisted user in group when mentioned', () => {
    const adapter = new StubAdapter(['210994982838335']);
    expect(adapter.shouldExecute('210994982838335@lid', 'group', true)).toBe(true);
  });

  it('blocks whitelisted user in group when NOT mentioned', () => {
    const adapter = new StubAdapter(['210994982838335']);
    expect(adapter.shouldExecute('210994982838335@lid', 'group', false)).toBe(false);
  });

  it('blocks non-whitelisted user in group even when mentioned', () => {
    const adapter = new StubAdapter(['210994982838335']);
    expect(adapter.shouldExecute('99999999999999@lid', 'group', true)).toBe(false);
  });

  it('matches JID with @s.whatsapp.net domain against numeric allowFrom', () => {
    const adapter = new StubAdapter(['6282123123373']);
    expect(adapter.shouldExecute('6282123123373@s.whatsapp.net', 'private', false)).toBe(true);
  });

  it('matches full JID in allowFrom', () => {
    const adapter = new StubAdapter(['210994982838335@lid']);
    expect(adapter.shouldExecute('210994982838335@lid', 'private', false)).toBe(true);
  });

  it('supports multiple allowFrom entries', () => {
    const adapter = new StubAdapter(['210994982838335', '6282123123373', '133315818422434']);
    expect(adapter.shouldExecute('210994982838335@lid', 'private', false)).toBe(true);
    expect(adapter.shouldExecute('6282123123373@s.whatsapp.net', 'private', false)).toBe(true);
    expect(adapter.shouldExecute('133315818422434@lid', 'private', false)).toBe(true);
    expect(adapter.shouldExecute('99999999999999@lid', 'private', false)).toBe(false);
  });
});

// ── Group routing: sessionKey uses group JID ─────────────────────────────────

describe('Group routing: sessionKey uses group JID', () => {
  it('sessionKey contains group JID for group messages', () => {
    const msg = createWhatsAppMessage({
      isGroup: true,
      senderJid: '210994982838335@lid',
      groupJid: '120363426286921624@g.us',
      text: '@176136675979485 hello',
    });
    // sessionJid is the group JID, used for session key
    expect(msg.sessionJid).toBe('120363426286921624@g.us');
    // fromUserId is the sender JID, used for whitelist
    const normalized = normalizeWhatsAppMessage(msg, { botJid: '6282123123373@s.whatsapp.net' });
    expect(normalized?.fromUserId).toBe('210994982838335@lid');
  });

  it('sessionKey contains user JID for private messages', () => {
    const msg = createWhatsAppMessage({
      isGroup: false,
      senderJid: '210994982838335@lid',
      text: 'hello',
    });
    expect(msg.sessionJid).toBe('210994982838335@lid');
    const normalized = normalizeWhatsAppMessage(msg, { botJid: '6282123123373@s.whatsapp.net' });
    expect(normalized?.fromUserId).toBe('210994982838335@lid');
  });

  it('replies route to group JID (sessionKey has group JID)', () => {
    const adapter = new StubAdapter(['210994982838335']);
    // Session key built from group JID
    const sessionKey = 'whatsapp-test:120363426286921624@g.us';
    adapter.send(sessionKey, 'reply to group');
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0].sessionKey).toBe(sessionKey);
    expect(adapter.sent[0].text).toBe('reply to group');
  });

  it('replies route to user JID for private chat', () => {
    const adapter = new StubAdapter(['210994982838335']);
    const sessionKey = 'whatsapp-test:210994982838335@lid';
    adapter.send(sessionKey, 'reply to user');
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0].sessionKey).toBe(sessionKey);
  });

  it('reactions route to group JID (sessionKey has group JID)', () => {
    const adapter = new StubAdapter(['210994982838335']);
    const sessionKey = 'whatsapp-test:120363426286921624@g.us';
    adapter.react(sessionKey, 'msg_123', '👍');
    expect(adapter.reactCalls).toHaveLength(1);
    expect(adapter.reactCalls[0].recipientId).toBe(sessionKey);
    expect(adapter.reactCalls[0].emoji).toBe('👍');
  });

  it('typing indicators route to group JID', () => {
    const adapter = new StubAdapter(['210994982838335']);
    const sessionKey = 'whatsapp-test:120363426286921624@g.us';
    adapter.startTyping(sessionKey, true);
    expect(adapter.typingStarted).toHaveLength(1);
    expect(adapter.typingStarted[0].sessionKey).toBe(sessionKey);
  });
});

// ── End-to-end: pipeline routing ─────────────────────────────────────────────

describe('Pipeline: inbound → execution → reply routing', () => {
  it('group message: whitelisted + mentioned → executes → replies to group', async () => {
    const adapter = new StubAdapter(['210994982838335']);
    const sessionKey = 'whatsapp-test:120363426286921624@g.us';

    const msg = createNormalizedMessage({
      userId: '210994982838335@lid',
      chatType: 'group',
      isMentioned: true,
      text: '@176136675979485 hello',
    });

    // shouldExecute returns true (whitelisted + mentioned)
    expect(adapter.shouldExecute(msg.fromUserId, msg.chatType, msg.isMentioned)).toBe(true);

    // Reply routes to group (sessionKey has group JID)
    await adapter.send(sessionKey, 'Hello! How can I help?');
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0].sessionKey).toBe('whatsapp-test:120363426286921624@g.us');
  });

  it('group message: whitelisted + NOT mentioned → skips execution', async () => {
    const adapter = new StubAdapter(['210994982838335']);
    const msg = createNormalizedMessage({
      userId: '210994982838335@lid',
      chatType: 'group',
      isMentioned: false,
      text: 'random chat message',
    });

    expect(adapter.shouldExecute(msg.fromUserId, msg.chatType, msg.isMentioned)).toBe(false);
  });

  it('group message: non-whitelisted + mentioned → skips execution', async () => {
    const adapter = new StubAdapter(['210994982838335']);
    const msg = createNormalizedMessage({
      userId: '99999999999999@lid',
      chatType: 'group',
      isMentioned: true,
      text: '@176136675979485 hello stranger',
    });

    expect(adapter.shouldExecute(msg.fromUserId, msg.chatType, msg.isMentioned)).toBe(false);
  });

  it('private message: whitelisted → executes (no mention needed)', async () => {
    const adapter = new StubAdapter(['210994982838335']);
    const sessionKey = 'whatsapp-test:210994982838335@lid';

    const msg = createNormalizedMessage({
      userId: '210994982838335@lid',
      chatType: 'private',
      isMentioned: false,
      text: 'hello bot',
    });

    expect(adapter.shouldExecute(msg.fromUserId, msg.chatType, msg.isMentioned)).toBe(true);

    // Reply routes to user (sessionKey has user JID)
    await adapter.send(sessionKey, 'Hello!');
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0].sessionKey).toBe('whatsapp-test:210994982838335@lid');
  });

  it('private message: non-whitelisted → skips execution', async () => {
    const adapter = new StubAdapter(['210994982838335']);
    const msg = createNormalizedMessage({
      userId: '99999999999999@lid',
      chatType: 'private',
      isMentioned: false,
      text: 'hello bot',
    });

    expect(adapter.shouldExecute(msg.fromUserId, msg.chatType, msg.isMentioned)).toBe(false);
  });

  it('no allowFrom configured: allows all users in all contexts', async () => {
    const adapter = new StubAdapter(undefined);

    expect(adapter.shouldExecute('anyone@lid', 'private', false)).toBe(true);
    expect(adapter.shouldExecute('anyone@lid', 'group', false)).toBe(true);
    expect(adapter.shouldExecute('anyone@lid', 'group', true)).toBe(true);
  });

  it('empty allowFrom: blocks all users in all contexts', async () => {
    const adapter = new StubAdapter([]);

    expect(adapter.shouldExecute('anyone@lid', 'private', false)).toBe(false);
    expect(adapter.shouldExecute('anyone@lid', 'group', false)).toBe(false);
    expect(adapter.shouldExecute('anyone@lid', 'group', true)).toBe(false);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('handles @number with special chars around it', () => {
    const msg = createWhatsAppMessage({
      isGroup: true,
      text: '@176136675979485! help',
    });
    const result = normalizeWhatsAppMessage(msg, { botJid: '6282123123373@s.whatsapp.net' });
    expect(result?.isMentioned).toBe(true);
  });

  it('handles multiple @numbers in text', () => {
    const msg = createWhatsAppMessage({
      isGroup: true,
      text: '@176136675979485 and @6282123123373 help',
    });
    const result = normalizeWhatsAppMessage(msg, { botJid: '6282123123373@s.whatsapp.net' });
    expect(result?.isMentioned).toBe(true);
  });

  it('ignores @mentions in non-group (always true)', () => {
    const msg = createWhatsAppMessage({
      isGroup: false,
      text: 'no mention at all',
    });
    const result = normalizeWhatsAppMessage(msg, { botJid: '6282123123373@s.whatsapp.net' });
    expect(result?.isMentioned).toBe(true);
  });

  it('handles empty text in group (returns null when no media)', () => {
    // Normalizer returns null for messages with no text and no media
    const msg: WhatsAppInboundMessage = {
      messageId: 'msg_123',
      jid: '210994982838335@lid',
      sessionJid: '120363426286921624@g.us',
      text: '',
      fromMe: false,
      isGroup: true,
      timestamp: Date.now(),
    };
    const result = normalizeWhatsAppMessage(msg, { botJid: '6282123123373@s.whatsapp.net' });
    expect(result).toBeNull();
  });

  it('preserves pushName in fromUser', () => {
    const msg = createWhatsAppMessage({
      isGroup: true,
      text: '@176136675979485 hello',
      senderJid: '210994982838335@lid',
    });
    // Manually set pushName
    Object.assign(msg, { pushName: 'Vadi Taslim' });
    const result = normalizeWhatsAppMessage(msg, { botJid: '6282123123373@s.whatsapp.net' });
    expect(result?.fromUser).toBe('Vadi Taslim');
  });
});
