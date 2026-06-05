/**
 * Per-key message debouncer
 * Accumulates rapid messages from the same sender, flushes after a delay
 * Prevents partial messages from triggering separate agent runs
 */
export function createMessageDebouncer(onFlush, opts = {}) {
    const delayMs = opts.delayMs ?? 1500;
    const maxBatch = opts.maxBatch ?? 20;
    const pending = new Map();
    function flush(key) {
        const entry = pending.get(key);
        if (!entry)
            return;
        pending.delete(key);
        clearTimeout(entry.timer);
        if (entry.messages.length > 0) {
            onFlush(key, entry.messages, entry.normalized);
        }
    }
    return {
        flush,
        flushAll() {
            const keys = [...pending.keys()];
            for (const key of keys)
                flush(key);
        },
        push(key, message, normalized) {
            let entry = pending.get(key);
            if (!entry) {
                entry = {
                    messages: [],
                    normalized,
                    timer: setTimeout(() => flush(key), delayMs),
                };
                pending.set(key, entry);
            }
            else {
                // Reset timer on each new message
                clearTimeout(entry.timer);
                entry.timer = setTimeout(() => flush(key), delayMs);
                // Update normalized if provided (latest normalized wins)
                if (normalized)
                    entry.normalized = normalized;
            }
            entry.messages.push(message);
            // Force flush if batch is full
            if (entry.messages.length >= maxBatch) {
                flush(key);
            }
        },
    };
}
//# sourceMappingURL=debounce.js.map