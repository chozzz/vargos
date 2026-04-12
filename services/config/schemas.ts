import { z } from 'zod';

// ─── JSON ─────────────────────────────────────────────────────────────────────

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

// z.lazy is required for the recursive JSON type
export const JsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonSchema),
    z.record(z.string(), JsonSchema),
  ]),
);

// ─── Primitives ───────────────────────────────────────────────────────────────

export const ThinkingLevelSchema = z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']);
export const PromptModeSchema    = z.enum(['full', 'minimal', 'none']);
export const ChannelTypeSchema   = z.enum(['telegram', 'whatsapp']);

export type ThinkingLevel = z.infer<typeof ThinkingLevelSchema>;
export type PromptMode    = z.infer<typeof PromptModeSchema>;
export type ChannelType   = z.infer<typeof ChannelTypeSchema>;

// ─── Providers (DEPRECATED — now managed by Pi Agent) ───────────────────────
// Provider definitions have moved to ~/.vargos/agent/models.json (Pi Agent's registry).
// This field is deprecated and ignored. For backward compatibility, it is still
// accepted but not used. Update your ~/.vargos/agent/models.json with provider details.

export const ProviderConfigSchema = z.object({
  baseUrl: z.string(),
  apiKey:  z.string(),
  api:     z.string().optional(),
}).passthrough();

export const ProvidersSchema = z.record(z.string(), ProviderConfigSchema);

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type Providers      = z.infer<typeof ProvidersSchema>;

// ─── Channels ─────────────────────────────────────────────────────────────────

const ChannelBaseSchema = z.object({
  id:         z.string(),
  enabled:    z.boolean().default(true),
  model:      z.string().optional(),   // overrides agent.model for runs from this channel
  debounceMs: z.number().int().min(0).optional(),
  allowFrom:  z.array(z.string()).optional(),
});

export const TelegramChannelSchema  = ChannelBaseSchema.extend({ type: z.literal('telegram'),  botToken: z.string() });
export const WhatsAppChannelSchema  = ChannelBaseSchema.extend({ type: z.literal('whatsapp') });

export const ChannelEntrySchema = z.discriminatedUnion('type', [
  TelegramChannelSchema,
  WhatsAppChannelSchema,
]);

export type ChannelEntry   = z.infer<typeof ChannelEntrySchema>;
export type TelegramChannel = z.infer<typeof TelegramChannelSchema>;
export type WhatsAppChannel = z.infer<typeof WhatsAppChannelSchema>;

// ─── Cron ─────────────────────────────────────────────────────────────────────

export const CronTaskSchema = z.object({
  id:       z.string(),
  name:     z.string(),
  schedule: z.string(),
  task:     z.string(),
  notify:   z.array(z.string()).optional(),
  enabled:  z.boolean().default(true),
});

export const CronAddSchema    = CronTaskSchema.omit({ id: true, enabled: true });
export const CronUpdateSchema = CronTaskSchema.partial().required({ id: true });

export type CronTask       = z.infer<typeof CronTaskSchema>;
export type CronAddParams  = z.infer<typeof CronAddSchema>;
export type CronUpdateParams = z.infer<typeof CronUpdateSchema>;

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export const WebhookEntrySchema = z.object({
  id:        z.string(),
  name:      z.string(),
  token:     z.string(),
  transform: z.string().optional(),  // path to JS/TS transform file
  notify:    z.array(z.string()).optional(),
});

export type WebhookEntry = z.infer<typeof WebhookEntrySchema>;

// ─── Agent ────────────────────────────────────────────────────────────────────
// Vargos-only routing fields. PiAgent-owned settings (thinkingLevel,
// thinkingBudgets, retry, compaction) live in ~/.vargos/agent/settings.json
// managed by PiAgent's SettingsManager.

export const AgentConfigSchema = z.object({
  model:    z.string(),
  fallback: z.string().optional(),
  /** Global timeout for agent.execute (main or subagent). Milliseconds. Default: 30 minutes. */
  executionTimeoutMs: z.number().int().positive().default(30 * 60 * 1000),
  subagents: z.object({
    maxSpawnDepth:     z.number().int().min(1).default(3),
    runTimeoutSeconds: z.number().int().positive().default(300),
    maxChildren:       z.number().int().min(0).optional(),
    model:             z.string().optional(),
  }).default({}),
  media: z.object({
    audio: z.string().optional(),
    image: z.string().optional(),
  }).optional(),
}).passthrough();

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// ─── Feature configs ──────────────────────────────────────────────────────────

export const HeartbeatConfigSchema = z.object({
  enabled:          z.boolean().default(true),
  intervalMinutes:  z.number().int().positive().default(30),
  // [startHour, endHour] — see activeHoursTimezone (default: UTC)
  activeHours:      z.tuple([z.number().int().min(0).max(23), z.number().int().min(0).max(23)]).optional(),
  /** IANA zone id, e.g. Australia/Sydney — when set, activeHours are interpreted in this zone */
  activeHoursTimezone: z.string().optional(),
  notify:           z.array(z.string()).optional(),
});

export const LinkExpandConfigSchema = z.object({
  enabled:       z.boolean().default(true),
  maxUrls:       z.number().int().positive().default(3),
  maxCharsPerUrl: z.number().int().positive().default(8_000),
  timeoutMs:     z.number().int().positive().default(5_000),
});

export type HeartbeatConfig  = z.infer<typeof HeartbeatConfigSchema>;
export type LinkExpandConfig = z.infer<typeof LinkExpandConfigSchema>;

// ─── MCP client (HTTP bridge) ─────────────────────────────────────────────────

export const McpClientConfigSchema = z.object({
  bearerToken: z.string().optional(),
  host:        z.string().optional(),
  port:        z.number().int().min(1).max(65535).optional(),
  endpoint:    z.string().optional(),
  transport:   z.enum(['http', 'stdio']).optional(),
});

export type McpClientConfig = z.infer<typeof McpClientConfigSchema>;

// ─── External MCP servers (agent / tooling; preserved for docs & future wiring) ─

export const McpServerEntrySchema = z.object({
  command: z.string(),
  args:    z.array(z.string()).optional(),
  env:     z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
}).passthrough();

export const McpServersConfigSchema = z.record(z.string(), McpServerEntrySchema);

export type McpServerEntry = z.infer<typeof McpServerEntrySchema>;

// ─── Storage (memory backend hint) ────────────────────────────────────────────

export const StorageConfigSchema = z.object({
  type: z.enum(['sqlite', 'postgres']).default('sqlite'),
  url:  z.string().optional(),
});

export type StorageConfig = z.infer<typeof StorageConfigSchema>;
