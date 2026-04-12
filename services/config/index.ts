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
    auth: z.record(z.string(), z.any()).optional(),
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

export function saveConfig(path: string, config: AppConfig): void {
  writeFileSync(path, JSON.stringify(config, null, 2), { mode: 0o600 });
}

// ─── ConfigService ───────────────────────────────────────────────────────────

export class ConfigService {
  private readonly log = createLogger('config');
  private readonly configFile: string;
  private readonly agentDir: string;
  private readonly agentModelsFile: string;
  private readonly agentSettingsFile: string;
  private readonly agentAuthFile: string;

  constructor(
    private readonly bus: Bus
  ) {
    const { configFile, dataDir } = getDataPaths();
    this.configFile = configFile;
    this.agentDir = path.join(dataDir, 'agent');
    this.agentModelsFile = path.join(this.agentDir, 'models.json');
    this.agentSettingsFile = path.join(this.agentDir, 'settings.json');
    this.agentAuthFile = path.join(this.agentDir, 'auth.json');
  }

  private loadConfig(): AppConfig {
    const raw = JSON.parse(readFileSync(this.configFile, 'utf8'));

    // Load agent/settings.json and merge with existing agent config (settings takes precedence)
    try {
      const settingsContent = readFileSync(this.agentSettingsFile, 'utf8');
      const settings = JSON.parse(settingsContent);
      if (settings && typeof settings === 'object') {
        raw.agent = { ...(raw.agent as Record<string, unknown>), ...settings };
      }
    } catch {
      // File may not exist yet — validation will catch if required
    }

    // Load agent/models.json and merge providers
    try {
      const modelsContent = readFileSync(this.agentModelsFile, 'utf8');
      const models = JSON.parse(modelsContent);
      if (models.providers) {
        raw.providers = models.providers;
      }
    } catch {
      // File may not exist yet, that's okay
    }

    // Load auth.json and include redacted version
    try {
      const authPath = path.join(this.agentDir, 'auth.json');
      const authContent = readFileSync(authPath, 'utf8');
      const auth = JSON.parse(authContent);
      if (auth && typeof auth === 'object') {
        raw.auth = {};
        for (const provider of Object.keys(auth)) {
          (raw.auth as Record<string, unknown>)[provider] = { redacted: true };
        }
      }
    } catch {
      // File may not exist yet, that's okay
    }

    // Validate merged config
    const result = AppConfigSchema.safeParse(raw);
    if (!result.success) {
      const issues = result.error.issues
        .map(i => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid config at ${this.configFile}:\n${issues}`);
    }
    return result.data;
  }

  @register('config.get', {
    description: 'Get the current application configuration (merged from config.json, agent/models.json, agent/settings.json).',
    schema: z.object({}),
  })
  async get(_params: EventMap['config.get']['params']): Promise<AppConfig> {
    return this.loadConfig();
  }

  @register('config.set', {
    description: 'Update the application config. Intelligently routes to correct file (config.json, agent/models.json, or agent/settings.json).',
    schema: z.object({}).passthrough(),
  })
  async set(params: AppConfig): Promise<AppConfig> {
    const parsed = AppConfigSchema.parse(params);

    // Split config into components by ownership
    const configForFile: AppConfig = { ...parsed };
    const agentModels: Record<string, unknown> = {};
    let agentSettings: Record<string, unknown> = {};
    let authData: Record<string, unknown> = {};

    // Load existing agent/settings.json to preserve other fields
    try {
      agentSettings = JSON.parse(readFileSync(this.agentSettingsFile, 'utf8'));
    } catch {
      // File doesn't exist yet
    }

    // Extract agent config to agent/settings.json
    if (configForFile.agent) {
      agentSettings = { ...agentSettings, ...configForFile.agent };
      delete (configForFile as any).agent;
    }

    // Load existing auth.json to preserve other credentials
    try {
      const authPath = path.join(this.agentDir, 'auth.json');
      authData = JSON.parse(readFileSync(authPath, 'utf8'));
    } catch {
      // File doesn't exist yet
    }

    // Extract auth credentials to agent/auth.json
    if (configForFile.auth) {
      authData = { ...authData, ...configForFile.auth };
      delete (configForFile as any).auth;
    }

    // Extract providers to agent/models.json
    if (configForFile.providers) {
      agentModels.providers = configForFile.providers;
      delete configForFile.providers;
    }

    // Load existing agent/models.json to preserve other fields
    try {
      const existing = JSON.parse(readFileSync(this.agentModelsFile, 'utf8'));
      Object.assign(agentModels, existing, agentModels); // Preserve existing, override with new
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

    if (Object.keys(authData).length > 0) {
      if (!existsSync(this.agentDir)) {
        mkdirSync(this.agentDir, { recursive: true });
      }
      const authPath = path.join(this.agentDir, 'auth.json');
      writeFileSync(authPath, JSON.stringify(authData, null, 2), { mode: 0o600 });
    }

    this.log.info('config updated and persisted');
    return this.loadConfig();
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop?(): void }> {
  const svc = new ConfigService(bus);
  bus.bootstrap(svc);
  return {};
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export * from './schemas/index.js';
