/**
 * Reply delivery with chunking and retry
 * Splits long responses on paragraph/sentence boundaries
 */

import { createLogger } from '../../lib/logger.js';
import { sleep } from '../../lib/sleep.js';
import { withRetry } from '../../lib/retry.js';

const log = createLogger('delivery');

export type SendFn = (text: string) => Promise<void>;

function chunkText(text: string, maxSize: number): string[] {
  if (text.length <= maxSize) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxSize) {
      chunks.push(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf('\n\n', maxSize);
    if (splitAt <= 0) splitAt = remaining.lastIndexOf('\n', maxSize);
    if (splitAt <= 0) {
      splitAt = remaining.lastIndexOf('. ', maxSize);
      if (splitAt > 0) splitAt += 1;
    }
    if (splitAt <= 0) splitAt = maxSize;

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks.filter((c) => c.length > 0);
}

export async function deliverReply(
  send: SendFn,
  text: string,
  opts: { maxChunkSize?: number; chunkDelayMs?: number; maxRetries?: number; retryBaseMs?: number } = {},
): Promise<void> {
  const maxChunkSize = opts.maxChunkSize ?? 4000;
  const chunkDelayMs = opts.chunkDelayMs ?? 500;
  const maxRetries = opts.maxRetries ?? 3;
  const retryBaseMs = opts.retryBaseMs ?? 1000;

  const chunks = chunkText(text, maxChunkSize);
  log.debug(`delivering ${text.length} chars in ${chunks.length} chunk(s)`);

  for (let i = 0; i < chunks.length; i++) {
    await withRetry(() => send(chunks[i]), { maxRetries, baseMs: retryBaseMs, jitter: false });

    if (i < chunks.length - 1) await sleep(chunkDelayMs);
  }
}
