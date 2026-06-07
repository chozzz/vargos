/**
 * Structured retry with exponential backoff.
 * Pure utility — no domain imports, no side effects beyond timing.
 */
export interface RetryConfig {
    /** Max number of retry attempts after initial failure. Default: 3 */
    maxRetries?: number;
    /** Base delay in ms for backoff calculation. Default: 1000 */
    baseMs?: number;
    /** Maximum delay cap in ms. Default: 30_000 */
    maxMs?: number;
    /** Add up to 25% random jitter to each delay. Default: true */
    jitter?: boolean;
    /** Return false to rethrow immediately without retrying. Default: always retry */
    shouldRetry?: (error: unknown) => boolean;
    /** Abort mid-retry on signal cancellation */
    signal?: AbortSignal;
}
export declare function withRetry<T>(fn: () => Promise<T>, config?: RetryConfig): Promise<T>;
//# sourceMappingURL=retry.d.ts.map