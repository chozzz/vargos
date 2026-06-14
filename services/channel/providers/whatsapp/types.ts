/** WhatsApp adapter types */

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
  mediaBuffer?: Buffer;
  mimeType?: string;
  caption?: string;
}

export interface WhatsAppSessionEvents {
  onQR: (qr: string) => void;
  onConnected: (name: string) => void;
  onDisconnected: (reason: string) => void;
  onMessage: (msg: WhatsAppInboundMessage) => void;
}
