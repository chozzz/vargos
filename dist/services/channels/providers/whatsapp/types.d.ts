/** WhatsApp adapter types */
export interface WhatsAppInboundMessage {
    messageId: string;
    jid: string;
    sessionJid: string;
    text: string;
    fromMe: boolean;
    isGroup: boolean;
    timestamp: number;
    pushName?: string;
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
//# sourceMappingURL=types.d.ts.map