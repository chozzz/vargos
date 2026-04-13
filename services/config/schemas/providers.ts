/**
 * Provider configuration schemas (from ~/.vargos/agent/models.json)
 *
 * Providers include baseUrl, API type, and registry of available models with cost/capability info.
 */

import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  baseUrl: z.string(),
  api: z.string().default('openai-completions').describe('API type (default: openai-completions)'),
  models: z.array(z.object({
    id: z.string(),
    name: z.string(),
    reasoning: z.boolean().optional(),
    input: z.array(z.string()).optional(),
    cost: z.object({
      input: z.number(),
      output: z.number(),
      cacheRead: z.number().optional(),
      cacheWrite: z.number().optional(),
    }).optional(),
    contextWindow: z.number().optional(),
    maxTokens: z.number().optional(),
  })).optional(),
}).passthrough();

export const ProvidersSchema = z.record(z.string(), ProviderConfigSchema);

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type Providers = z.infer<typeof ProvidersSchema>;
