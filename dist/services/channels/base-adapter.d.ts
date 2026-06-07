/**
 * Base channel adapter — shared logic for typing indicators, debounce, dedupe, and media handling.
 */
import type { ChannelType, OnInboundMessageFn, InboundMediaSource, ChannelAdapter, NormalizedInboundMessage, AdapterDeps } from './types.js';
import type { ChannelStatus } from '../../gateway/events.js';
import { createMessageDebouncer } from './debounce.js';
import { TypingStateManager } from './typing-state.js';
export declare const MEDIA_TYPE_LABELS: Record<string, string>;
export declare abstract class BaseChannelAdapter<TRaw = never> implements ChannelAdapter {
    abstract readonly type: ChannelType;
    readonly instanceId: string;
    status: ChannelStatus;
    protected dedupe: import("./dedupe.js").DedupeCache;
    protected debouncer: ReturnType<typeof createMessageDebouncer>;
    protected onInboundMessage?: OnInboundMessageFn;
    protected typingState: TypingStateManager;
    protected readonly log: {
        debug: (msg: string, data?: import("../config/schemas/primitives.js").Json) => void;
        info: (msg: string, data?: import("../config/schemas/primitives.js").Json) => void;
        warn: (msg: string, data?: import("../config/schemas/primitives.js").Json) => void;
        error: (msg: string, data?: import("../config/schemas/primitives.js").Json) => void;
    };
    protected debounceMs: number;
    protected latestMessageId: Map<string, string>;
    protected transcribeFn?: (filePath: string) => Promise<string>;
    protected describeFn?: (filePath: string) => Promise<string>;
    protected extractFn?: (filePath: string, mimeType: string) => Promise<{
        text: string;
    }>;
    protected allowFrom?: string[];
    constructor(instanceId: string, _channelType: ChannelType, deps: AdapterDeps, allowFrom?: string[], debounceMs?: number);
    protected createDebouncer(): ReturnType<typeof createMessageDebouncer>;
    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;
    abstract send(sessionKey: string, text: string): Promise<void>;
    protected abstract sendTypingIndicator(sessionKey: string): Promise<void>;
    /** Extract userId from sessionKey for adapter-specific use. */
    extractUserId(sessionKey: string): string;
    /** Get latest message ID for a user (used for reactions). */
    extractLatestMessageId(userId: string): string | null | undefined;
    startTyping(sessionKey: string, inToolExecution?: boolean): void;
    resumeTyping(sessionKey: string): void;
    stopTyping(sessionKey: string, final?: boolean): void;
    protected handleBatch(id: string, messages: string[], normalizedMsg?: NormalizedInboundMessage): Promise<void>;
    protected buildSessionKey(id: string): string;
    protected cleanupTimers(): void;
    /** Override to handle media resolution for your channel. Typed via the adapter's TRaw param. */
    protected resolveMedia(_msg: TRaw): Promise<InboundMediaSource | null>;
    /**
     * Check if the agent should execute for this message.
     * Used by both media processing and agent execution decisions.
     *
     * Rules:
     * - Private chat: whitelisted user → execute
     * - Group chat: mentioned + whitelisted → execute
     * - No allowFrom configured: always execute (permissive)
     */
    shouldExecute(userId: string, chatType: string, isMentioned: boolean): boolean;
    /**
     * Process inbound media: save file, optionally transcribe/describe.
     * Returns caption text + saved path for routing to onInboundMessage.
     */
    protected processInboundMedia(msg: TRaw, route: (text: string) => Promise<void>, sessionKey: string, shouldProcessMedia?: boolean): Promise<{
        caption: string;
        savedPath: string;
        mimeType: string;
    }>;
}
//# sourceMappingURL=base-adapter.d.ts.map