/**
 * Execute a promise with timeout protection.
 * Rejects with an error if the promise doesn't complete within the specified time.
 */
export declare function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message?: string): Promise<T>;
//# sourceMappingURL=timeout.d.ts.map