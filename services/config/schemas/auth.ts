/**
 * Authentication configuration schemas
 *
 * Auth entries map provider names to credentials with type and key.
 */

import { z } from 'zod';

export const AuthEntrySchema = z.object({
  type: z.enum(['api_key']).default('api_key'),
  key: z.string().describe('API key or credential value'),
});

export const AuthSchema = z.record(z.string(), AuthEntrySchema).optional();

export type AuthEntry = z.infer<typeof AuthEntrySchema>;
export type Auth = z.infer<typeof AuthSchema>;
