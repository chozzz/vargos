/**
 * Execute a promise with timeout protection.
 * Rejects with an error if the promise doesn't complete within the specified time.
 */
export function withTimeout(promise, timeoutMs, message) {
    const timeoutPromise = new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error(message ?? `Timeout after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]);
}
//# sourceMappingURL=timeout.js.map