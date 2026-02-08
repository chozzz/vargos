/**
 * Message deduplication cache
 * Prevents processing the same message twice within a TTL window
 */

export interface DedupeOptions {
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
  clear(): void;
  size: number;
}

export function createDedupeCache(opts: DedupeOptions = {}): DedupeCache {
  const ttlMs = opts.ttlMs ?? 60_000;
  const maxSize = opts.maxSize ?? 10_000;
  const entries = new Map<string, number>();

  function evictExpired(): void {
    const now = Date.now();
    for (const [key, ts] of entries) {
      if (now - ts > ttlMs) entries.delete(key);
    }
  }

  function evictOldest(): void {
    if (entries.size <= maxSize) return;
    const toRemove = entries.size - maxSize;
    let removed = 0;
    for (const key of entries.keys()) {
      if (removed >= toRemove) break;
      entries.delete(key);
      removed++;
    }
  }

  return {
    has(key: string): boolean {
      const ts = entries.get(key);
      if (ts === undefined) return false;
      if (Date.now() - ts > ttlMs) {
        entries.delete(key);
        return false;
      }
      return true;
    },

    add(key: string): boolean {
      if (this.has(key)) return false;
      entries.set(key, Date.now());
      evictOldest();
      return true;
    },

    clear(): void {
      entries.clear();
    },

    get size(): number {
      evictExpired();
      return entries.size;
    },
  };
}
