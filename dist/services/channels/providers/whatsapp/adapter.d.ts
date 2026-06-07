/**
 * WhatsApp channel adapter via Baileys
 */
import type { InboundMediaSource, AdapterDeps } from '../../types.js';
import { BaseChannelAdapter } from '../../base-adapter.js';
import type { WhatsAppInboundMessage } from './types.js';
export declare class WhatsAppAdapter extends BaseChannelAdapter<WhatsAppInboundMessage> {
    readonly type: "whatsapp";
    private sock;
    private botJid;
    private botLid;
    private reconnector;
    private reconnectTimer;
    private authDir;
    constructor(instanceId: string, deps: AdapterDeps, allowFrom?: string[]);
    start(): Promise<void>;
    stop(): Promise<void>;
    send(sessionKey: string, text: string): Promise<void>;
    sendMedia(sessionKey: string, filePath: string, mimeType: string, caption?: string): Promise<void>;
    protected sendTypingIndicator(sessionKey: string): Promise<void>;
    react(sessionKey: string, messageId: string, emoji: string): Promise<void>;
    private toJid;
    private handleInbound;
    protected resolveMedia(msg: WhatsAppInboundMessage): Promise<InboundMediaSource | null>;
    private handleMedia;
    /**
     * Reset credentials to allow re-pairing after logout.
     * Sets registered=false and clears user identity so Baileys shows QR code.
     */
    private resetCredentialsForRepairing;
    private scheduleReconnect;
}
//# sourceMappingURL=adapter.d.ts.map