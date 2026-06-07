/**
 * Channel types and adapter contracts — the boundary between core policy and
 * provider implementations. Core calls ChannelAdapter; adapters call onInbound.
 */
import type { ChannelStatus } from '../../gateway/events.js';
import type { ChannelEntry } from '../config/schemas/channels.js';
export type ChannelType = 'whatsapp' | 'telegram' | (string & {});
export interface InboundMediaSource {
    buffer: Buffer;
    mimeType: string;
    mediaType: 'image' | 'audio' | 'video' | 'document';
    caption?: string;
    duration?: number;
}
export interface ExtractedMedia {
    filePath: string;
    mimeType: string;
}
/**
 * Required interface all channel adapters must implement.
 * Core calls these methods; adapters call onInboundMessage callback.
 */
export interface ChannelAdapter {
    readonly instanceId: string;
    readonly type: ChannelType;
    readonly status: ChannelStatus;
    start(): Promise<void>;
    stop(): Promise<void>;
    send(sessionKey: string, text: string): Promise<void>;
    startTyping(sessionKey: string, withToolFlag: boolean): void;
    stopTyping(sessionKey: string, final?: boolean): void;
    resumeTyping(sessionKey: string): void;
    extractLatestMessageId(userId: string): string | null | undefined;
    shouldExecute(userId: string, chatType: string, isMentioned: boolean): boolean;
    sendMedia?: (sessionKey: string, filePath: string, mimeType: string, caption?: string) => Promise<void>;
    react?: (sessionKey: string, messageId: string, emoji: string) => Promise<void>;
}
/**
 * Adapter dependencies — passed during construction.
 * Unifies callback injection into a single parameter.
 */
export interface AdapterDeps {
    onInbound: OnInboundMessageFn;
    transcribe?: (filePath: string) => Promise<string>;
    describe?: (filePath: string) => Promise<string>;
    extract?: (filePath: string, mimeType: string) => Promise<{
        text: string;
    }>;
}
/**
 * Provider pattern: factory for creating channel adapters.
 * Generic over the channel entry type for type-safe config passing.
 */
export interface ChannelProvider<TEntry extends ChannelEntry = ChannelEntry> {
    readonly type: TEntry['type'];
    createAdapter(instanceId: string, config: TEntry, deps: AdapterDeps): Promise<ChannelAdapter>;
}
/**
 * Canonical inbound message shape after normalization.
 * All adapters emit this (via normalizers), core policy handles this.
 */
export interface NormalizedInboundMessage {
    messageId: string;
    fromUserId: string;
    fromUser: string;
    fromUserHandle?: string;
    chatType: 'private' | 'group';
    isMentioned: boolean;
    channelType: string;
    botUserId?: string;
    botName?: string;
    botHandle?: string;
    text?: string;
    media?: InboundMediaSource;
}
/**
 * Callback signature for inbound messages.
 * Adapters call this when a message arrives.
 */
export type OnInboundMessageFn = (sessionKey: string, normalizedMessage: NormalizedInboundMessage) => Promise<void>;
//# sourceMappingURL=types.d.ts.map