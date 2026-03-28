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
  const raw = normalizeV1Config(JSON.parse(readFileSync(path, 'utf8')));
  const result = AppConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid config at ${path}:\n${issues}`);
  }
  return result.data;
}

/**
 * Normalize v1 config format to v2.
 * - models: Record<name, profile> → Array<profile & { name }>
 * - agent.primary → agent.model
 * - heartbeat.activeHours: { start, end, timezone } → [startHour, endHour]
 */
function normalizeV1Config(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };

  // models: object → array
  if (out.models && !Array.isArray(out.models) && typeof out.models === 'object') {
    out.models = Object.entries(out.models as Record<string, unknown>).map(([name, profile]) => ({
      name,
      ...(profile as object),
    }));
  }

  // agent.primary → agent.model
  if (out.agent && typeof out.agent === 'object') {
    const agent = { ...(out.agent as Record<string, unknown>) };
    if (agent.primary && !agent.model) agent.model = agent.primary;
    delete agent.primary;
    delete agent.fallback;
    out.agent = agent;
  }

  // heartbeat.activeHours: { start, end } → [startHour, endHour]
  if (out.heartbeat && typeof out.heartbeat === 'object') {
    const hb = { ...(out.heartbeat as Record<string, unknown>) };
    if (hb.activeHours && !Array.isArray(hb.activeHours) && typeof hb.activeHours === 'object') {
      const ah = hb.activeHours as Record<string, string>;
      const start = parseInt(ah.start ?? '0', 10);
      const end   = parseInt(ah.end   ?? '23', 10);
      hb.activeHours = [start, end];
    }
    if (hb.every && !hb.intervalMinutes) {
      // keep every as-is (scheduler uses cron expression)
    }
    out.heartbeat = hb;
  }

  return out;
}

export function saveConfig(path: string, config: AppConfig): void {
  writeFileSync(path, JSON.stringify(config, null, 2), { mode: 0o600 });
}
