/**
 * Webhook configuration schemas
 */

import { z } from 'zod';

export const WebhookEntrySchema = z.object({
  id:        z.string(),
  name:      z.string(),
  token:     z.string(),
  transform: z.string().optional(),  // path to JS/TS transform file
  notify:    z.array(z.string()).optional(),
});

export type WebhookEntry = z.infer<typeof WebhookEntrySchema>;
