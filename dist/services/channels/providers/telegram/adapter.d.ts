/**
 * Telegram channel adapter — long-polling, IPv4-forced, no SDK dependency
 */
import type { InboundMediaSource, AdapterDeps } from '../../types.js';
import type { TelegramMessage } from './types.js';
import { BaseChannelAdapter } from '../../base-adapter.js';
export declare class TelegramAdapter extends BaseChannelAdapter<TelegramMessage> {
    private readonly botToken;
    readonly type: "telegram";
    private botUser;
    private offset;
    private polling;
    private abortController;
    private reconnector;
    constructor(instanceId: string, botToken: string, deps: AdapterDeps, allowFrom?: string[]);
    start(): Promise<void>;
    stop(): Promise<void>;
    send(sessionKey: string, text: string): Promise<void>;
    sendMedia(sessionKey: string, filePath: string, mimeType: string, caption?: string): Promise<void>;
    protected sendTypingIndicator(sessionKey: string): Promise<void>;
    react(sessionKey: string, messageId: string, emoji: string): Promise<void>;
    private pollLoop;
    private handleUpdate;
    private isMentioned;
    private downloadFile;
    protected resolveMedia(tgMsg: TelegramMessage): Promise<InboundMediaSource | null>;
    private handleMedia;
    private apiCall;
    /**
     * https.request wrapper forcing IPv4 — avoids Node.js fetch Happy Eyeballs IPv6 ETIMEDOUT
     */
    private request;
}
//# sourceMappingURL=adapter.d.ts.map