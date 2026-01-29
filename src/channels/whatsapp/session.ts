/**
 * WhatsApp socket creation via Baileys
 * Handles QR code auth and multi-file auth state persistence
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
  type WASocket,
  type ConnectionState,
  type WAMessage,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { promises as fs } from 'node:fs';

// libsignal-node's session_record.js uses console.info to dump raw Signal
// protocol state (crypto keys, ratchets) on every session close/open.
// We don't use console.info anywhere — silence it to suppress the noise.
console.info = () => {};

export interface WhatsAppSessionEvents {
  onQR: (qr: string) => void;
  onConnected: (name: string) => void;
  onDisconnected: (reason: string) => void;
  onMessage: (msg: WhatsAppInboundMessage) => void;
}

export interface WhatsAppInboundMessage {
  messageId: string;
  jid: string;
  text: string;
  fromMe: boolean;
  isGroup: boolean;
  timestamp: number;
  mediaType?: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  mediaBuffer?: Buffer;
  mimeType?: string;
  caption?: string;
}

export async function createWhatsAppSocket(
  authDir: string,
  events: WhatsAppSessionEvents,
): Promise<WASocket> {
  await fs.mkdir(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const logger = pino({ level: 'silent' }) as any;

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false,
  });

  // Handle connection updates
  sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrcode.generate(qr, { small: true });
      events.onQR(qr);
    }

    if (connection === 'close') {
      const err = lastDisconnect?.error as { output?: { statusCode?: number } } | undefined;
      const statusCode = err?.output?.statusCode;

      if (statusCode === DisconnectReason.loggedOut) {
        events.onDisconnected('logged_out');
      } else if (statusCode === DisconnectReason.restartRequired) {
        events.onDisconnected('restart_required');
      } else {
        events.onDisconnected(`closed:${statusCode}`);
      }
    }

    if (connection === 'open') {
      const name = sock.user?.name || sock.user?.id || 'unknown';
      events.onConnected(name);
    }
  });

  // Persist credentials
  sock.ev.on('creds.update', saveCreds);

  // Handle incoming messages
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;
      processInboundMessage(msg, events);
    }
  });

  return sock;
}

/**
 * Extract text and media from a Baileys message, then emit via events.onMessage
 */
export async function processInboundMessage(
  msg: WAMessage,
  events: WhatsAppSessionEvents,
): Promise<void> {
  const m = msg.message!;
  const jid = msg.key.remoteJid || '';
  const base = {
    messageId: msg.key.id || '',
    jid,
    fromMe: msg.key.fromMe || false,
    isGroup: jid.endsWith('@g.us'),
    timestamp: typeof msg.messageTimestamp === 'number'
      ? msg.messageTimestamp * 1000
      : Date.now(),
  };

  // Detect media type
  const mediaMsg =
    m.imageMessage ? { type: 'image' as const, msg: m.imageMessage } :
    m.audioMessage ? { type: 'audio' as const, msg: m.audioMessage } :
    m.videoMessage ? { type: 'video' as const, msg: m.videoMessage } :
    m.documentMessage ? { type: 'document' as const, msg: m.documentMessage } :
    m.stickerMessage ? { type: 'sticker' as const, msg: m.stickerMessage } :
    null;

  if (mediaMsg) {
    let mediaBuffer: Buffer | undefined;
    try {
      const downloaded = await downloadMediaMessage(msg, 'buffer', {});
      mediaBuffer = Buffer.isBuffer(downloaded)
        ? downloaded
        : Buffer.from(downloaded as Uint8Array);
    } catch (err) {
      console.error(`[WhatsApp] Media download failed for ${base.messageId}:`, err);
    }

    const caption = (mediaMsg.msg as { caption?: string }).caption || '';
    const mimeType = (mediaMsg.msg as { mimetype?: string }).mimetype || undefined;

    events.onMessage({
      ...base,
      text: caption,
      mediaType: mediaMsg.type,
      mediaBuffer,
      mimeType,
      caption,
    });
    return;
  }

  // Plain text
  const text = m.conversation || m.extendedTextMessage?.text || '';
  if (!text) return;

  events.onMessage({ ...base, text });
}
