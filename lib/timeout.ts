/**
 * Execute a promise with timeout protection.
 * Rejects with an error if the promise doesn't complete within the specified time.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message?: string): Promise<T> {
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error(message ?? `Timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}
