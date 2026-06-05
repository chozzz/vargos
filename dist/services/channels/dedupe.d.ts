/**
 * Message deduplication cache
 * Prevents processing the same message twice within a TTL window
 */
export interface DedupeConfig {
    /** Time-to-live in milliseconds (default: 60_000) */
    ttlMs?: number;
    /** Max entries before oldest are evicted (default: 10_000) */
    maxSize?: number;
}
export interface DedupeCache {
    /** Returns true if the key was already seen (still within TTL) */
    has(key: string): boolean;
    /** Mark key as seen; returns true if it was new */
    add(key: string): boolean;
    size: number;
}
export declare function createDedupeCache(opts?: DedupeConfig): DedupeCache;
//# sourceMappingURL=dedupe.d.ts.map