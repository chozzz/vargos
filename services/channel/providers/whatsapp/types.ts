/** WhatsApp adapter types */

import type { WAMessage } from '@whiskeysockets/baileys';

export interface WhatsAppInboundMessage {
  messageId: string;
  jid: string;                // sender's JID (for whitelist checks)
  sessionJid: string;         // chat/group JID (for session key + routing)
  text: string;
  fromMe: boolean;
  isGroup: boolean;
  timestamp: number;
  pushName?: string;            // sender's WhatsApp display name (set in their profile)
  mentionedJids?: string[];
  quotedSenderJid?: string;
  mediaType?: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  mimeType?: string;
  caption?: string;
  /** Kept only for media: the adapter downloads bytes lazily, after dedupe. */
  raw?: WAMessage;
}

export interface WhatsAppSessionEvents {
  onQR: (qr: string) => void;
  onConnected: (name: string) => void;
  onDisconnected: (reason: string) => void;
  onMessage: (msg: WhatsAppInboundMessage) => void;
  /** Called after each creds.update is flushed to disk. Used by the CLI pairing flow to
   *  confirm credentials are persisted before process.exit(). Optional — daemon doesn't use it. */
  onCredsSaved?: () => void;
}
