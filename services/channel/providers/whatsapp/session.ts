/**
 * WhatsApp socket creation via Baileys
 * Handles QR code auth and multi-file auth state persistence
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
  type WASocket,
  type ConnectionState,
  type WAMessage,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { promises as fs } from 'node:fs';
import type { WhatsAppSessionEvents } from './types.js';

// libsignal-node session_record.js dumps Signal protocol state via console.info — silence it.
console.info = () => { };

export async function createWhatsAppSocket(
  authDir: string,
  events: WhatsAppSessionEvents,
): Promise<WASocket> {
  await fs.mkdir(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  const logger = pino({ level: 'silent' }) as pino.Logger;

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

  sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    // QR means Baileys wants to pair. The caller decides: the CLI `pair` flow renders it;
    // the daemon adapter treats it as "needs repair" and aborts (no QR at runtime).
    if (qr) events.onQR(qr);

    if (connection === 'close') {
      const err = lastDisconnect?.error as { output?: { statusCode?: number } } | undefined;
      const code = err?.output?.statusCode;

      if (code === DisconnectReason.loggedOut
        || code === DisconnectReason.connectionReplaced
        || code === DisconnectReason.forbidden) {
        const label = code === DisconnectReason.loggedOut ? 'logged_out'
          : code === DisconnectReason.connectionReplaced ? 'connection_replaced'
            : 'forbidden';
        events.onDisconnected(label);
      } else if (code === DisconnectReason.restartRequired) {
        events.onDisconnected('restart_required');
      } else {
        events.onDisconnected(`closed:${code}`);
      }
    }

    if (connection === 'open') {
      const name = sock.user?.name || sock.user?.id || 'unknown';
      events.onConnected(name);
    }
  });

  sock.ev.on('creds.update', async () => {
    await saveCreds();
    events.onCredsSaved?.();
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message) continue;
      processInboundMessage(msg, events);
    }
  });

  return sock;
}

export function processInboundMessage(
  msg: WAMessage,
  events: WhatsAppSessionEvents,
): void {
  const m = msg.message!;
  // Baileys normalizes JID structure in cleanMessage() (strips device/agent suffixes,
  // converts @c.us→@s.whatsapp.net) but does NOT resolve LID→PN. We apply
  // jidNormalizedUser here as a defense-in-depth to ensure consistent JID format.
  const remoteJid = jidNormalizedUser(msg.key.remoteJid || '');
  const isGroup = remoteJid.endsWith('@g.us');
  // Session key uses remoteJid (group JID for groups, user JID for private).
  // This ensures replies and reactions route to the correct destination.
  // Whitelist checks use participant (sender) separately.
  const jid = jidNormalizedUser(isGroup ? (msg.key.participant || remoteJid) : remoteJid);
  const sessionJid = remoteJid; // always the chat/group for session key routing
  const mentionedJids = (m.extendedTextMessage?.contextInfo?.mentionedJid ?? []).map(
    (j: string) => jidNormalizedUser(j),
  );
  const quotedSenderJid = m.extendedTextMessage?.contextInfo?.participant
    ? jidNormalizedUser(m.extendedTextMessage.contextInfo.participant as string)
    : undefined;

  const base = {
    messageId: msg.key.id || '',
    jid,
    sessionJid, // group JID for groups, user JID for private — used for session key + routing
    fromMe: msg.key.fromMe || false,
    isGroup,
    timestamp: typeof msg.messageTimestamp === 'number'
      ? msg.messageTimestamp * 1000
      : Date.now(),
    pushName: msg.pushName || undefined,
    mentionedJids: mentionedJids.length > 0 ? mentionedJids : undefined,
    quotedSenderJid,
  };

  const mediaMsg =
    m.imageMessage ? { type: 'image' as const, msg: m.imageMessage } :
      m.audioMessage ? { type: 'audio' as const, msg: m.audioMessage } :
        m.videoMessage ? { type: 'video' as const, msg: m.videoMessage } :
          m.documentMessage ? { type: 'document' as const, msg: m.documentMessage } :
            m.stickerMessage ? { type: 'sticker' as const, msg: m.stickerMessage } :
              null;

  // Bytes are fetched later by the adapter's resolveMedia — downloading here would
  // pay for every duplicate and every message the whitelist is about to reject.
  if (mediaMsg) {
    const caption = (mediaMsg.msg as { caption?: string }).caption || '';
    const mimeType = (mediaMsg.msg as { mimetype?: string }).mimetype || undefined;

    events.onMessage({ ...base, raw: msg, text: caption, mediaType: mediaMsg.type, mimeType, caption });
    return;
  }

  const text = m.conversation || m.extendedTextMessage?.text || '';
  if (!text) return;
  events.onMessage({ ...base, text });
}
