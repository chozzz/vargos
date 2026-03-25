import { z } from 'zod';
import { readFileSync, writeFileSync } from 'node:fs';
import { AgentConfigSchema, ChannelEntrySchema, CronTaskSchema, WebhookEntrySchema, HeartbeatConfigSchema, LinkExpandConfigSchema, ModelProfileSchema } from './schemas.js';

// ─── App config ───────────────────────────────────────────────────────────────

export const AppConfigSchema = z.object({
  models:   z.array(ModelProfileSchema).min(1),
  agent:    AgentConfigSchema,
  channels: z.array(ChannelEntrySchema).default([]),
  cron: z.object({
    tasks: z.array(CronTaskSchema).default([]),
  }).default({}),
  webhooks:    z.array(WebhookEntrySchema).default([]),
  heartbeat:   HeartbeatConfigSchema.default({}),
  linkExpand:  LinkExpandConfigSchema.default({}),
  mcp: z.object({
    bearerToken: z.string().optional(),
  }).default({}),
  paths: z.object({
    dataDir:   z.string().optional(),
    workspace: z.string().optional(),
  }).default({}),
  gateway: z.object({
    port: z.number().int().min(1).max(65535).default(9000),
  }).default({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

// ─── Load / save ──────────────────────────────────────────────────────────────

export function loadConfig(path: string): AppConfig {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const result = AppConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid config at ${path}:\n${issues}`);
  }
  return result.data;
}

export function saveConfig(path: string, config: AppConfig): void {
  writeFileSync(path, JSON.stringify(config, null, 2), { mode: 0o600 });
}
