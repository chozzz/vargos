/**
 * Structured bus errors. JSON-RPC error codes are attached so the RPC surface can
 * map them without re-classifying — every surface (CLI, RPC, agent) surfaces the
 * same error for the same cause.
 */

import type { z } from 'zod';

/** Format a zod error's issues as `path: message` entries joined by `; `. */
export function formatZodIssues(error: z.ZodError): string {
  return error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

export class BusError extends Error {
  constructor(message: string, readonly code: number) {
    super(message);
    this.name = new.target.name;
  }
}

/** `bus.call('does.not.exist')` — method is not in the registry. */
export class MethodNotFoundError extends BusError {
  constructor(method: string) {
    super(`Method not found: ${method}`, -32601);
  }
}

/** Params failed the method's zod schema. Carries the formatted issue list. */
export class ValidationError extends BusError {
  constructor(method: string, error: z.ZodError) {
    super(`Invalid params for ${method}: ${formatZodIssues(error)}`, -32602);
  }
}
