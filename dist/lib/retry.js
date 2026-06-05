/**
 * Structured retry with exponential backoff.
 * Pure utility — no domain imports, no side effects beyond timing.
 */
import { sleep } from './sleep.js';
function computeDelay(attempt, baseMs, maxMs, jitter) {
    const base = Math.min(baseMs * 2 ** attempt, maxMs);
    // Jitter adds 0–25% of the capped delay to spread retries
    const extra = jitter ? Math.random() * 0.25 * base : 0;
    return base + extra;
}
export async function withRetry(fn, config) {
    const maxRetries = config?.maxRetries ?? 3;
    const baseMs = config?.baseMs ?? 1000;
    const maxMs = config?.maxMs ?? 30_000;
    const jitter = config?.jitter ?? true;
    const shouldRetry = config?.shouldRetry ?? (() => true);
    const signal = config?.signal;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            if (!shouldRetry(err))
                throw err;
            if (signal?.aborted) {
                throw signal.reason ?? new DOMException('Aborted', 'AbortError');
            }
            // No delay after final attempt — just fall through and rethrow
            if (attempt === maxRetries)
                break;
            const delay = computeDelay(attempt, baseMs, maxMs, jitter);
            await sleep(delay, signal);
        }
    }
    throw lastError;
}
//# sourceMappingURL=retry.js.map