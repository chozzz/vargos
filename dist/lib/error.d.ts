/**
 * Error utilities — message extraction, sanitization, classification.
 */
/** Extract a human-readable message from an unknown error value. */
export declare function toMessage(err: unknown): string;
/** Scrub API keys, bearer tokens, and credentials from error strings. */
export declare function sanitizeError(msg: string): string;
export type ErrorClass = 'transient' | 'auth' | 'timeout' | 'rate_limit' | 'capability' | 'unknown';
/** Classify an error message for user-facing display. */
export declare function classifyError(msg: string): ErrorClass;
//# sourceMappingURL=error.d.ts.map