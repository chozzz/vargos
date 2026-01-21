import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WAMessage } from '@whiskeysockets/baileys';
import type { WhatsAppSessionEvents, WhatsAppInboundMessage } from './session.js';

// Mock downloadMediaMessage before importing the module
vi.mock('@whiskeysockets/baileys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@whiskeysockets/baileys')>();
  return {
    ...actual,
    downloadMediaMessage: vi.fn(),
  };
});

import { processInboundMessage } from './session.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const mockDownload = vi.mocked(downloadMediaMessage);

function makeEvents(): WhatsAppSessionEvents & { received: WhatsAppInboundMessage[] } {
  const received: WhatsAppInboundMessage[] = [];
  return {
    received,
    onQR: vi.fn(),
    onConnected: vi.fn(),
    onDisconnected: vi.fn(),
    onMessage: (msg) => received.push(msg),
  };
}

function makeWAMessage(overrides: Partial<WAMessage> & { message: WAMessage['message'] }): WAMessage {
  return {
    key: {
      remoteJid: '5511999999999@s.whatsapp.net',
      id: 'msg-001',
      fromMe: false,
    },
    messageTimestamp: 1700000000,
    ...overrides,
  } as WAMessage;
}

describe('processInboundMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should extract plain text from conversation', async () => {
    const events = makeEvents();
    const msg = makeWAMessage({
      message: { conversation: 'hello world' },
    });

    await processInboundMessage(msg, events);

    expect(events.received).toHaveLength(1);
    expect(events.received[0].text).toBe('hello world');
    expect(events.received[0].mediaType).toBeUndefined();
  });

  it('should extract text from extendedTextMessage', async () => {
    const events = makeEvents();
    const msg = makeWAMessage({
      message: { extendedTextMessage: { text: 'extended text' } } as any,
    });

    await processInboundMessage(msg, events);

    expect(events.received).toHaveLength(1);
    expect(events.received[0].text).toBe('extended text');
  });

  it('should skip messages with no text and no media', async () => {
    const events = makeEvents();
    const msg = makeWAMessage({
      message: { conversation: '' },
    });

    await processInboundMessage(msg, events);

    expect(events.received).toHaveLength(0);
  });

  it('should extract image message with caption and buffer', async () => {
    const fakeBuffer = Buffer.from('fake-image-data');
    mockDownload.mockResolvedValue(fakeBuffer);

    const events = makeEvents();
    const msg = makeWAMessage({
      message: {
        imageMessage: {
          mimetype: 'image/png',
          caption: 'check this out',
        },
      } as any,
    });

    await processInboundMessage(msg, events);

    expect(events.received).toHaveLength(1);
    const received = events.received[0];
    expect(received.mediaType).toBe('image');
    expect(received.mediaBuffer).toEqual(fakeBuffer);
    expect(received.mimeType).toBe('image/png');
    expect(received.caption).toBe('check this out');
    expect(received.text).toBe('check this out');
  });

  it('should handle image without caption', async () => {
    mockDownload.mockResolvedValue(Buffer.from('img'));

    const events = makeEvents();
    const msg = makeWAMessage({
      message: { imageMessage: { mimetype: 'image/jpeg' } } as any,
    });

    await processInboundMessage(msg, events);

    expect(events.received).toHaveLength(1);
    expect(events.received[0].caption).toBe('');
    expect(events.received[0].text).toBe('');
  });

  it('should extract audio message', async () => {
    mockDownload.mockResolvedValue(Buffer.from('audio'));

    const events = makeEvents();
    const msg = makeWAMessage({
      message: {
        audioMessage: { mimetype: 'audio/ogg; codecs=opus' },
      } as any,
    });

    await processInboundMessage(msg, events);

    expect(events.received).toHaveLength(1);
    expect(events.received[0].mediaType).toBe('audio');
    expect(events.received[0].mimeType).toBe('audio/ogg; codecs=opus');
  });

  it('should handle media download failure gracefully', async () => {
    mockDownload.mockRejectedValue(new Error('network error'));

    const events = makeEvents();
    const msg = makeWAMessage({
      message: { imageMessage: { mimetype: 'image/jpeg' } } as any,
    });

    await processInboundMessage(msg, events);

    // Still emits the message, just without buffer
    expect(events.received).toHaveLength(1);
    expect(events.received[0].mediaType).toBe('image');
    expect(events.received[0].mediaBuffer).toBeUndefined();
  });

  it('should detect video messages', async () => {
    mockDownload.mockResolvedValue(Buffer.from('video'));

    const events = makeEvents();
    const msg = makeWAMessage({
      message: { videoMessage: { mimetype: 'video/mp4' } } as any,
    });

    await processInboundMessage(msg, events);

    expect(events.received).toHaveLength(1);
    expect(events.received[0].mediaType).toBe('video');
  });

  it('should detect document messages', async () => {
    mockDownload.mockResolvedValue(Buffer.from('doc'));

    const events = makeEvents();
    const msg = makeWAMessage({
      message: {
        documentMessage: { mimetype: 'application/pdf', caption: 'my doc' },
      } as any,
    });

    await processInboundMessage(msg, events);

    expect(events.received).toHaveLength(1);
    expect(events.received[0].mediaType).toBe('document');
    expect(events.received[0].caption).toBe('my doc');
  });

  it('should set correct jid and timestamp', async () => {
    const events = makeEvents();
    const msg = makeWAMessage({
      key: {
        remoteJid: '447700900000@s.whatsapp.net',
        id: 'msg-x',
        fromMe: false,
      },
      messageTimestamp: 1700001234,
      message: { conversation: 'hi' },
    });

    await processInboundMessage(msg, events);

    expect(events.received[0].jid).toBe('447700900000@s.whatsapp.net');
    expect(events.received[0].timestamp).toBe(1700001234000);
    expect(events.received[0].isGroup).toBe(false);
  });

  it('should detect group jids', async () => {
    const events = makeEvents();
    const msg = makeWAMessage({
      key: { remoteJid: '120363001234@g.us', id: 'msg-g', fromMe: false },
      message: { conversation: 'group msg' },
    });

    await processInboundMessage(msg, events);

    expect(events.received[0].isGroup).toBe(true);
  });
});
