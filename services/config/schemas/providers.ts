/**
 * Provider configuration schemas (DEPRECATED — now managed by PiAgent)
 *
 * Provider definitions have moved to ~/.vargos/agent/models.json (Pi Agent's registry).
 * This field is deprecated and ignored. For backward compatibility, it is still
 * accepted but not used. Update your ~/.vargos/agent/models.json with provider details.
 */

import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  baseUrl: z.string().optional(),
  apiKey:  z.string().optional(),
  api:     z.string().optional(),
}).passthrough();

export const ProvidersSchema = z.record(z.string(), ProviderConfigSchema);

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type Providers      = z.infer<typeof ProvidersSchema>;
