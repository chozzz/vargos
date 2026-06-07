/**
 * Per-key message debouncer
 * Accumulates rapid messages from the same sender, flushes after a delay
 * Prevents partial messages from triggering separate agent runs
 */
import type { NormalizedInboundMessage } from './types.js';
export interface DebounceConfig {
    /** Delay in ms before flushing accumulated messages (default: 1500) */
    delayMs?: number;
    /** Maximum messages to batch before force-flushing (default: 20) */
    maxBatch?: number;
}
export interface MessageDebouncer {
    /** Add a message for a given key. Resets the flush timer. */
    push(key: string, message: string, normalized?: NormalizedInboundMessage): void;
    /** Immediately flush pending messages for a key */
    flush(key: string): void;
    /** Immediately flush all pending keys */
    flushAll(): void;
}
export declare function createMessageDebouncer(onFlush: (key: string, messages: string[], normalized?: NormalizedInboundMessage) => void, opts?: DebounceConfig): MessageDebouncer;
//# sourceMappingURL=debounce.d.ts.map