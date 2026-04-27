/**
 * Safe async execution utilities — centralized error context and handling.
 * Reduces boilerplate in services that wrap async operations with logging.
 */

import { toMessage } from './error.js';

/**
 * Execute async operation with automatic error logging.
 * Returns result or undefined if operation throws.
 */
export async function safeAwait<T>(
  promise: Promise<T>,
  context: { operation: string; service: string; log: { error(msg: string, data?: unknown): void } },
): Promise<T | undefined> {
  try {
    return await promise;
  } catch (err) {
    context.log.error(`${context.operation} failed in ${context.service}`, {
      error: toMessage(err),
    });
    return undefined;
  }
}

/**
 * Wrap async function with error context logging.
 * Useful for event handlers and callbacks.
 */
export function withErrorContext<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  context: { operation: string; service: string; log: { error(msg: string, data?: unknown): void } },
): (...args: Args) => Promise<R | undefined> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      context.log.error(`${context.operation} failed`, {
        error: toMessage(err),
      });
      return undefined;
    }
  };
}
