/**
 * Feature-specific configuration schemas.
 */

import { z } from 'zod';

export const LinkExpandConfigSchema = z.object({
  enabled: z.boolean().default(true).describe('Whether services/channel should expand URLs before passing messages to the agent'),
  maxUrls: z.number().int().positive().default(3).describe('Maximum URLs expanded per channel message'),
  maxCharsPerUrl: z.number().int().positive().default(8_000).describe('Maximum fetched text kept from each expanded URL'),
  timeoutMs: z.number().int().positive().default(5_000).describe('Fetch timeout used by services/channel link expansion'),
}).describe('URL expansion settings consumed by services/channel/link-expand.ts');

export type LinkExpandConfig = z.infer<typeof LinkExpandConfigSchema>;
