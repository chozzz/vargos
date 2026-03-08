/**
 * Structured retry with exponential backoff.
 * Pure utility — no domain imports, no side effects beyond timing.
 */

import { sleep } from './sleep.js';

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

function computeDelay(attempt: number, baseMs: number, maxMs: number, jitter: boolean): number {
  const base = Math.min(baseMs * 2 ** attempt, maxMs);
  // Jitter adds 0–25% of the capped delay to spread retries
  const extra = jitter ? Math.random() * 0.25 * base : 0;
  return base + extra;
}

export async function withRetry<T>(fn: () => Promise<T>, config?: RetryConfig): Promise<T> {
  const maxRetries = config?.maxRetries ?? 3;
  const baseMs = config?.baseMs ?? 1000;
  const maxMs = config?.maxMs ?? 30_000;
  const jitter = config?.jitter ?? true;
  const shouldRetry = config?.shouldRetry ?? (() => true);
  const signal = config?.signal;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (!shouldRetry(err)) throw err;

      if (signal?.aborted) {
        throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      }

      // No delay after final attempt — just fall through and rethrow
      if (attempt === maxRetries) break;

      const delay = computeDelay(attempt, baseMs, maxMs, jitter);
      await sleep(delay, signal);
    }
  }

  throw lastError;
}
