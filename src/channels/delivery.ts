/**
 * Reply delivery with chunking and retry
 * Splits long responses on paragraph/sentence boundaries
 * Retries with exponential backoff on failure
 */

import { createLogger } from '../lib/logger.js';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await send(chunks[i]);
        log.debug(`chunk ${i + 1}/${chunks.length} sent (${chunks[i].length} chars)`);
        lastError = undefined;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        log.error(`chunk ${i + 1} attempt ${attempt + 1} failed: ${lastError.message}`);
        if (attempt < maxRetries) {
          await sleep(retryBaseMs * 2 ** attempt);
        }
      }
    }

    if (lastError) {
      log.error(`chunk ${i + 1} delivery failed after ${maxRetries + 1} attempts`);
      throw lastError;
    }

    // Delay between chunks (not after last)
    if (i < chunks.length - 1) {
      await sleep(chunkDelayMs);
    }
  }
}
