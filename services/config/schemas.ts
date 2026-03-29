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

export const ThinkingLevelSchema = z.enum(['off', 'low', 'medium', 'high']);
export const PromptModeSchema    = z.enum(['full', 'minimal', 'none']);
export const ChannelTypeSchema   = z.enum(['telegram', 'whatsapp']);

export type ThinkingLevel = z.infer<typeof ThinkingLevelSchema>;
export type PromptMode    = z.infer<typeof PromptModeSchema>;
export type ChannelType   = z.infer<typeof ChannelTypeSchema>;

// ─── Model ────────────────────────────────────────────────────────────────────

export const ModelProfileSchema = z.object({
  name:        z.string(),
  provider:    z.enum(['anthropic', 'openai', 'ollama', 'openrouter', 'google']),
  model:       z.string(),
  apiKey:      z.string().optional(),
  baseUrl:     z.string().url().optional(),
  maxRetries:  z.number().int().min(0).default(3),
  // Per-level token budgets, e.g. { low: 2048, high: 16384 }
  thinkingBudgets: z.record(ThinkingLevelSchema, z.number().int().positive()).optional(),
});

export type ModelProfile = z.infer<typeof ModelProfileSchema>;

// ─── Channels ─────────────────────────────────────────────────────────────────

const ChannelBaseSchema = z.object({
  id:         z.string(),
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

export const AgentConfigSchema = z.object({
  model:         z.string(),
  thinkingLevel: ThinkingLevelSchema.default('high'),
  thinkingBudgets: z.record(ThinkingLevelSchema, z.number().int().positive()).optional(),
  maxRetryDelayMs: z.number().int().default(30_000),
  subagents: z.object({
    maxSpawnDepth:     z.number().int().min(1).default(3),
    runTimeoutSeconds: z.number().int().positive().default(300),
  }).default({}),
  // Model name per media type for STT/OCR preprocessing before the LLM sees the message
  media: z.object({
    audio: z.string().optional(),
    image: z.string().optional(),
  }).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// ─── Feature configs ──────────────────────────────────────────────────────────

export const HeartbeatConfigSchema = z.object({
  enabled:          z.boolean().default(true),
  intervalMinutes:  z.number().int().positive().default(30),
  // [startHour, endHour] in UTC — skipped outside this window
  activeHours:      z.tuple([z.number().int().min(0).max(23), z.number().int().min(0).max(23)]).optional(),
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
