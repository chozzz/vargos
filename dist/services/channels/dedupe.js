/**
 * Message deduplication cache
 * Prevents processing the same message twice within a TTL window
 */
export function createDedupeCache(opts = {}) {
    const ttlMs = opts.ttlMs ?? 60_000;
    const maxSize = opts.maxSize ?? 10_000;
    const entries = new Map();
    function evictExpired() {
        const now = Date.now();
        for (const [key, ts] of entries) {
            if (now - ts > ttlMs)
                entries.delete(key);
        }
    }
    function evictOldest() {
        if (entries.size <= maxSize)
            return;
        const toRemove = entries.size - maxSize;
        let removed = 0;
        for (const key of entries.keys()) {
            if (removed >= toRemove)
                break;
            entries.delete(key);
            removed++;
        }
    }
    return {
        has(key) {
            const ts = entries.get(key);
            if (ts === undefined)
                return false;
            if (Date.now() - ts > ttlMs) {
                entries.delete(key);
                return false;
            }
            return true;
        },
        add(key) {
            if (this.has(key))
                return false;
            entries.set(key, Date.now());
            evictOldest();
            return true;
        },
        get size() {
            evictExpired();
            return entries.size;
        },
    };
}
//# sourceMappingURL=dedupe.js.map