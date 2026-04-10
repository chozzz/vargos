import { z } from 'zod';
import { readFileSync, writeFileSync } from 'node:fs';
import { register } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import {
  AgentConfigSchema,
  ChannelEntrySchema,
  CronTaskSchema,
  WebhookEntrySchema,
  HeartbeatConfigSchema,
  LinkExpandConfigSchema,
  ProvidersSchema,
  McpClientConfigSchema,
  McpServersConfigSchema,
  StorageConfigSchema,
  type ChannelEntry,
  type TelegramChannel,
  type WhatsAppChannel,
  type CronTask,
  type CronAddParams,
  type CronUpdateParams,
  type ProviderConfig,
  type ProviderModel,
  type Providers,
  type HeartbeatConfig,
  type WebhookEntry,
  type LinkExpandConfig,
  type McpClientConfig,
  type StorageConfig,
  type Json,
} from './schemas.js';
import { getDataPaths } from '../../lib/paths.js';
import { createLogger } from '../../lib/logger.js';

// ─── App config ───────────────────────────────────────────────────────────────

export const AppConfigSchema = z
  .object({
    providers: ProvidersSchema,
    agent: AgentConfigSchema,
    channels: z.array(ChannelEntrySchema).default([]),
    cron: z.object({
      tasks: z.array(CronTaskSchema).default([]),
    }).default({}),
    webhooks: z.array(WebhookEntrySchema).default([]),
    heartbeat: HeartbeatConfigSchema.default({}),
    linkExpand: LinkExpandConfigSchema.default({}),
    mcp: McpClientConfigSchema.default({}),
    mcpServers: McpServersConfigSchema.optional(),
    storage: StorageConfigSchema.optional(),
    media: z.object({
      audio: z.string().optional(),
      image: z.string().optional(),
    }).optional(),
    paths: z.object({
      dataDir: z.string().optional(),
      workspace: z.string().optional(),
    }).default({}),
    gateway: z.object({
      host: z.string().optional().default('127.0.0.1'),
      port: z.number().int().min(1).max(65535).default(9000),
      /** Client socket idle timeout (ms) for JSON-RPC connections */
      requestTimeout: z.number().int().positive().optional(),
    }).default({}),
  })
  .passthrough();

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type {
  ChannelEntry,
  TelegramChannel,
  WhatsAppChannel,
  CronTask,
  CronAddParams,
  CronUpdateParams,
  ProviderConfig,
  ProviderModel,
  Providers,
  HeartbeatConfig,
  WebhookEntry,
  LinkExpandConfig,
  McpClientConfig,
  StorageConfig,
  Json,
};

// ─── Load / save ──────────────────────────────────────────────────────────────

export function loadConfig(path: string): AppConfig {
  const raw = normalizeConfigInput(JSON.parse(readFileSync(path, 'utf8')));
  const result = AppConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid config at ${path}:\n${issues}`);
  }
  return result.data;
}

/** Cron pattern star-slash-N (every N minutes) → minutes; other expressions return undefined */
function cronEveryToIntervalMinutes(every: string): number | undefined {
  const m = every.trim().match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (!m) return undefined;
  return parseInt(m[1], 10);
}

/** "08:00" / "8" → hour component (0–23) */
function parseHourToken(s: string | undefined, fallback: number): number {
  if (s == null || s === '') return fallback;
  const match = /^(\d{1,2})/.exec(String(s).trim());
  if (!match) return fallback;
  const h = parseInt(match[1], 10);
  if (Number.isNaN(h) || h < 0 || h > 23) return fallback;
  return h;
}

/**
 * Normalize v1 config format to v2.
 * - models: Record<name, profile> → Array<profile & { name }>
 * - agent.primary → agent.model (fallback kept as agent.fallback)
 * - heartbeat.activeHours: { start, end, timezone } → tuple + activeHoursTimezone
 * - heartbeat.every: star-slash-N minute cron → intervalMinutes
 */
export function normalizeConfigInput(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };

  // agent.primary → agent.model
  if (out.agent && typeof out.agent === 'object') {
    const agent = { ...(out.agent as Record<string, unknown>) };
    if (agent.primary && !agent.model) agent.model = agent.primary;
    delete agent.primary;
    out.agent = agent;
  }

  // heartbeat
  if (out.heartbeat && typeof out.heartbeat === 'object') {
    const hb = { ...(out.heartbeat as Record<string, unknown>) };
    if (hb.activeHours && !Array.isArray(hb.activeHours) && typeof hb.activeHours === 'object') {
      const ah = hb.activeHours as Record<string, string>;
      const start = parseHourToken(ah.start, 0);
      const end = parseHourToken(ah.end, 23);
      hb.activeHours = [start, end];
      if (ah.timezone && typeof ah.timezone === 'string' && !hb.activeHoursTimezone) {
        hb.activeHoursTimezone = ah.timezone;
      }
    }
    if (typeof hb.every === 'string' && hb.intervalMinutes == null) {
      const mins = cronEveryToIntervalMinutes(hb.every);
      if (mins != null) hb.intervalMinutes = mins;
      delete hb.every;
    }
    out.heartbeat = hb;
  }

  return out;
}

export function saveConfig(path: string, config: AppConfig): void {
  writeFileSync(path, JSON.stringify(config, null, 2), { mode: 0o600 });
}

// ─── ConfigService ───────────────────────────────────────────────────────────

export class ConfigService {
  private config: AppConfig;
  private readonly log = createLogger('config');

  constructor(
    private readonly bus: Bus,
    private readonly file: string,
  ) {
    this.config = loadConfig(file);
  }

  @register('config.get', {
    description: 'Get the current application configuration.',
    schema: z.object({}),
  })
  async get(_params: EventMap['config.get']['params']): Promise<AppConfig> {
    return this.config;
  }

  @register('config.set', {
    description: 'Update the application config. Validates, persists to disk, and broadcasts config.onChanged.',
    schema: z.object({}).passthrough(),
  })
  async set(params: AppConfig): Promise<AppConfig> {
    const parsed = AppConfigSchema.parse(normalizeConfigInput(params as Record<string, unknown>));
    this.config = parsed;
    saveConfig(this.file, parsed);
    this.bus.emit('config.onChanged', parsed);
    this.log.info('config updated and persisted');
    return parsed;
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop?(): void }> {
  const svc = new ConfigService(bus, getDataPaths().configFile);
  bus.bootstrap(svc);
  return {};
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export * from './schemas.js';
