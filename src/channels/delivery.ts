/**
 * Reply delivery with chunking and retry
 * Splits long responses on paragraph/sentence boundaries
 * Retries with exponential backoff on failure
 */

import { createLogger } from '../lib/logger.js';
import { sleep } from '../lib/sleep.js';
import { withRetry } from '../lib/retry.js';

const log = createLogger('delivery');

export interface DeliveryOptions {
  /** Max characters per chunk (default: 4000) */
  maxChunkSize?: number;
  /** Delay between chunks in ms (default: 500) */
  chunkDelayMs?: number;
  /** Max retry attempts per chunk (default: 3) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  retryBaseMs?: number;
}

export type SendFn = (text: string) => Promise<void>;

/**
 * Split text into chunks on paragraph/sentence boundaries
 */
export function chunkText(text: string, maxSize: number): string[] {
  if (text.length <= maxSize) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxSize) {
      chunks.push(remaining);
      break;
    }

    // Try to split on double newline (paragraph)
    let splitAt = remaining.lastIndexOf('\n\n', maxSize);
    if (splitAt <= 0) {
      // Try single newline
      splitAt = remaining.lastIndexOf('\n', maxSize);
    }
    if (splitAt <= 0) {
      // Try sentence boundary
      splitAt = remaining.lastIndexOf('. ', maxSize);
      if (splitAt > 0) splitAt += 1; // Include the period
    }
    if (splitAt <= 0) {
      // Hard cut at maxSize
      splitAt = maxSize;
    }

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Deliver a reply via the provided send function
 * Chunks long text, retries on failure
 */
export async function deliverReply(
  send: SendFn,
  text: string,
  opts: DeliveryOptions = {},
): Promise<void> {
  const maxChunkSize = opts.maxChunkSize ?? 4000;
  const chunkDelayMs = opts.chunkDelayMs ?? 500;
  const maxRetries = opts.maxRetries ?? 3;
  const retryBaseMs = opts.retryBaseMs ?? 1000;

  const chunks = chunkText(text, maxChunkSize);
  log.debug(`delivering ${text.length} chars in ${chunks.length} chunk(s)`);

  for (let i = 0; i < chunks.length; i++) {
    await withRetry(() => send(chunks[i]), {
      maxRetries,
      baseMs: retryBaseMs,
      jitter: false,
    });
    log.debug(`chunk ${i + 1}/${chunks.length} sent (${chunks[i].length} chars)`);

    // Delay between chunks (not after last)
    if (i < chunks.length - 1) {
      await sleep(chunkDelayMs);
    }
  }
}
