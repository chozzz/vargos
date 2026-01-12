/**
 * WhatsApp socket creation via Baileys
 * Handles QR code auth and multi-file auth state persistence
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type ConnectionState,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { promises as fs } from 'node:fs';

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
}

export async function createWhatsAppSocket(
  authDir: string,
  events: WhatsAppSessionEvents,
): Promise<WASocket> {
  await fs.mkdir(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, undefined as any),
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
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      events.onDisconnected(loggedOut ? 'logged_out' : `closed:${statusCode}`);
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

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        '';
      if (!text) continue;

      const jid = msg.key.remoteJid || '';
      events.onMessage({
        messageId: msg.key.id || '',
        jid,
        text,
        fromMe: msg.key.fromMe || false,
        isGroup: jid.endsWith('@g.us'),
        timestamp: typeof msg.messageTimestamp === 'number'
          ? msg.messageTimestamp * 1000
          : Date.now(),
      });
    }
  });

  return sock;
}
