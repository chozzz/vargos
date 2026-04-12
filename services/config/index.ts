import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
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
  type Providers,
  type HeartbeatConfig,
  type WebhookEntry,
  type LinkExpandConfig,
  type McpClientConfig,
  type StorageConfig,
  type Json,
} from './schemas/index.js';
import { getDataPaths } from '../../lib/paths.js';
import { createLogger } from '../../lib/logger.js';

// ─── App config ───────────────────────────────────────────────────────────────

export const AppConfigSchema = z
  .object({
    providers: ProvidersSchema.optional(),
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
  Providers,
  HeartbeatConfig,
  WebhookEntry,
  LinkExpandConfig,
  McpClientConfig,
  StorageConfig,
  Json,
};

// ─── Load / save ──────────────────────────────────────────────────────────────

export function loadConfig(configPath: string, agentDir: string): AppConfig {
  const raw = normalizeConfigInput(JSON.parse(readFileSync(configPath, 'utf8')));

  // If agent config is missing from config.json, load from agent/settings.json
  if (!raw.agent) {
    try {
      const settingsPath = path.join(agentDir, 'settings.json');
      const settingsContent = readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(settingsContent);
      if (settings && typeof settings === 'object') {
        raw.agent = settings;
      }
    } catch {
      // settings.json missing or unparseable — validation will fail with clear error
    }
  }

  const result = AppConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid config at ${configPath}:\n${issues}`);
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
 * Normalize config format (legacy compatibility).
 * - agent.primary → agent.model
 * - heartbeat.activeHours: { start, end, timezone } → tuple + activeHoursTimezone
 * - heartbeat.every: star-slash-N minute cron → intervalMinutes
 *
 * Note: models array in providers is now optional (passthrough only) since Pi Agent is the
 * definitive source of truth for available models. Agent config is now sourced from
 * agent/settings.json as the single source of truth.
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
  private readonly configFile: string;
  private readonly agentDir: string;
  private readonly agentModelsFile: string;
  private readonly agentSettingsFile: string;

  constructor(
    private readonly bus: Bus,
    configFile: string,
    agentDir?: string,
  ) {
    this.configFile = configFile;
    this.agentDir = agentDir || path.join(path.dirname(configFile), '..', 'agent');
    this.agentModelsFile = path.join(this.agentDir, 'models.json');
    this.agentSettingsFile = path.join(this.agentDir, 'settings.json');
    this.config = this.mergeConfigs();
  }

  private mergeConfigs(): AppConfig {
    // Load main config (with agent/settings.json fallback if agent missing)
    const appConfig = loadConfig(this.configFile, this.agentDir);

    // Try to load and merge agent/models.json providers
    try {
      const modelsContent = readFileSync(this.agentModelsFile, 'utf8');
      const models = JSON.parse(modelsContent);
      if (models.providers) {
        appConfig.providers = models.providers;
      }
    } catch {
      // File may not exist yet, that's okay
    }

    // Load agent/settings.json as source of truth for agent config
    try {
      const settingsContent = readFileSync(this.agentSettingsFile, 'utf8');
      const settings = JSON.parse(settingsContent);
      if (settings && typeof settings === 'object') {
        appConfig.agent = settings;
      }
    } catch {
      // File may not exist yet, that's okay
    }

    return appConfig;
  }

  @register('config.get', {
    description: 'Get the current application configuration (merged from config.json, agent/models.json, agent/settings.json).',
    schema: z.object({}),
  })
  async get(_params: EventMap['config.get']['params']): Promise<AppConfig> {
    return this.config;
  }

  @register('config.set', {
    description: 'Update the application config. Intelligently routes to correct file (config.json, agent/models.json, or agent/settings.json).',
    schema: z.object({}).passthrough(),
  })
  async set(params: AppConfig): Promise<AppConfig> {
    const parsed = AppConfigSchema.parse(normalizeConfigInput(params as Record<string, unknown>));

    // Split config into components by ownership
    const configForFile: AppConfig = { ...parsed };
    const agentModels: Record<string, unknown> = {};
    const agentSettings: Record<string, unknown> = {};

    // Extract providers to agent/models.json
    if (configForFile.providers) {
      agentModels.providers = configForFile.providers;
      delete configForFile.providers;
    }

    // Load existing agent files to preserve other fields
    try {
      const existing = JSON.parse(readFileSync(this.agentModelsFile, 'utf8'));
      Object.assign(agentModels, existing, agentModels); // Preserve existing, override with new
    } catch {
      // File doesn't exist yet
    }

    try {
      const existing = JSON.parse(readFileSync(this.agentSettingsFile, 'utf8'));
      Object.assign(agentSettings, existing);
    } catch {
      // File doesn't exist yet
    }

    // Persist to appropriate files
    saveConfig(this.configFile, configForFile);

    if (Object.keys(agentModels).length > 0) {
      if (!existsSync(this.agentDir)) {
        mkdirSync(this.agentDir, { recursive: true });
      }
      writeFileSync(this.agentModelsFile, JSON.stringify(agentModels, null, 2), { mode: 0o600 });
    }

    if (Object.keys(agentSettings).length > 0) {
      if (!existsSync(this.agentDir)) {
        mkdirSync(this.agentDir, { recursive: true });
      }
      writeFileSync(this.agentSettingsFile, JSON.stringify(agentSettings, null, 2), { mode: 0o600 });
    }

    // Update in-memory config and broadcast
    this.config = this.mergeConfigs();
    this.bus.emit('config.onChanged', this.config);
    this.log.info('config updated and persisted');
    return this.config;
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop?(): void }> {
  const { configFile, dataDir } = getDataPaths();
  const agentDir = path.join(dataDir, 'agent');
  const svc = new ConfigService(bus, configFile, agentDir);
  bus.bootstrap(svc);
  return {};
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export * from './schemas/index.js';
