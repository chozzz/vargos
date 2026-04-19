/**
 * Per-key message debouncer
 * Accumulates rapid messages from the same sender, flushes after a delay
 * Prevents partial messages from triggering separate agent runs
 */

export interface DebounceOptions {
  /** Delay in ms before flushing accumulated messages (default: 1500) */
  delayMs?: number;
  /** Maximum messages to batch before force-flushing (default: 20) */
  maxBatch?: number;
}

export interface MessageDebouncer {
  /** Add a message for a given key. Resets the flush timer. */
  push(key: string, message: string): void;
  /** Immediately flush pending messages for a key */
  flush(key: string): void;
  /** Immediately flush all pending keys */
  flushAll(): void;
}

export function createMessageDebouncer(
  onFlush: (key: string, messages: string[]) => void,
  opts: DebounceOptions = {},
): MessageDebouncer {
  const delayMs = opts.delayMs ?? 1500;
  const maxBatch = opts.maxBatch ?? 20;

  const pending = new Map<string, { messages: string[]; timer: ReturnType<typeof setTimeout> }>();

  function flush(key: string): void {
    const entry = pending.get(key);
    if (!entry) return;
    pending.delete(key);
    clearTimeout(entry.timer);
    if (entry.messages.length > 0) {
      onFlush(key, entry.messages);
    }
  }

  return {
    flush,

    flushAll(): void {
      const keys = [...pending.keys()];
      for (const key of keys) flush(key);
    },

    push(key: string, message: string): void {
      let entry = pending.get(key);

      if (!entry) {
        entry = {
          messages: [],
          timer: setTimeout(() => flush(key), delayMs),
        };
        pending.set(key, entry);
      } else {
        // Reset timer on each new message
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => flush(key), delayMs);
      }

      entry.messages.push(message);

      // Force flush if batch is full
      if (entry.messages.length >= maxBatch) {
        flush(key);
      }
    },
  };
}


