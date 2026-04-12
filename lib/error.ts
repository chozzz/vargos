/**
 * Error utilities — message extraction, sanitization, classification.
 */

/** Extract a human-readable message from an unknown error value. */
export function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Scrub API keys, bearer tokens, and credentials from error strings. */
export function sanitizeError(msg: string): string {
  return msg
    // URL-embedded credentials (postgresql://user:pass@host)
    .replace(/:\/\/([^:]+):([^@]+)@/g, '://$1:***@')
    // Bearer tokens (including JWT with +/=)
    .replace(/Bearer\s+[A-Za-z0-9_\-.+/=]+/gi, 'Bearer ***')
    // Common API key formats (sk-..., xoxb-..., etc.)
    .replace(/\b(sk|xoxb|xoxp|ghp|gho|ghu|ghs|ghr|glpat)-[A-Za-z0-9_-]{8,}/g, '$1-***')
    // Generic key=value patterns for common secret field names
    .replace(/(api[_-]?key|token|secret|password|authorization)[=:]\s*["']?[^\s"',}{]+/gi, '$1=***');
}

export type ErrorClass = 'transient' | 'auth' | 'timeout' | 'rate_limit' | 'capability' | 'unknown';

/** Classify an error message for user-facing display. */
export function classifyError(msg: string): ErrorClass {
  const lower = msg.toLowerCase();

  if (/\b(401|403|unauthorized|forbidden|invalid.*auth|invalid.*key)\b/.test(lower)) {
    return 'auth';
  }
  if (/\b(429|rate.?limit|too many requests|quota|billing)\b/.test(lower)) {
    return 'rate_limit';
  }
  if (/\b(timeout|timed?\s*out|etimedout|deadline exceeded)\b/.test(lower)) {
    return 'timeout';
  }
  if (/\b(502|503|529|econnreset|econnrefused|network|socket hang up|fetch failed|retry)\b/.test(lower)) {
    return 'transient';
  }
  // Model capability mismatches — not retryable
  if (/no endpoints found|not support|unsupported.*model|model.*not.*available/i.test(lower)) {
    return 'capability';
  }
  return 'unknown';
}

