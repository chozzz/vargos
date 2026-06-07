/**
 * Reply delivery with chunking and retry
 * Splits long responses on paragraph/sentence boundaries
 */
export type SendFn = (text: string) => Promise<void>;
export declare function deliverReply(send: SendFn, text: string, opts?: {
    maxChunkSize?: number;
    chunkDelayMs?: number;
    maxRetries?: number;
    retryBaseMs?: number;
}): Promise<void>;
//# sourceMappingURL=delivery.d.ts.map