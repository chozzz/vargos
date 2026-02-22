/**
 * Vargos configuration — single ~/.vargos/config.json as source of truth
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const PI_AGENT_DIR = 'agent';
const CONFIG_FILE = 'config.json';

// Pi SDK path conventions (used by runtime + legacy migration)
const AUTH_FILE = 'auth.json';
const SETTINGS_FILE = 'settings.json';
const MODELS_FILE = 'models.json';

/** Named model profile — provider + model + credentials + limits */
export interface ModelProfile {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  contextWindow?: number;
}

/** Agent references into the models map */
export interface AgentRef {
  primary: string;
  fallback?: string;
}

/** @deprecated Use ModelProfile instead — kept for migration compatibility */
export type AgentConfig = ModelProfile;

export interface ChannelEntry {
  enabled?: boolean;
  botToken?: string;
  allowFrom?: string[];
}

export interface GatewayConfig {
  port?: number;
  host?: string;
}

export interface McpConfig {
  transport?: 'stdio' | 'http';
  host?: string;
  port?: number;
  endpoint?: string;
}

export interface PathsConfig {
  dataDir?: string;
  workspace?: string;
}

export interface StorageConfig {
  type: 'postgres' | 'sqlite';
  url?: string;  // required when type=postgres
}

export interface ActiveHoursConfig {
  start: string;    // "HH:MM"
  end: string;      // "HH:MM"
  timezone: string; // IANA, e.g. "Australia/Sydney"
}

export interface HeartbeatConfig {
  enabled?: boolean;              // default: false
  every?: string;                 // cron expression, default: "*/30 * * * *"
  activeHours?: ActiveHoursConfig;
  prompt?: string;                // custom heartbeat prompt override
}

export interface CronTaskConfig {
  name: string;
  schedule: string;
  task: string;
  enabled?: boolean;
  notify?: string[];
}

export interface CronConfig {
  tasks?: CronTaskConfig[];
}

export interface McpServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface VargosConfig {
  models: Record<string, ModelProfile>;
  agent: AgentRef;
  channels?: Record<string, ChannelEntry>;
  cron?: CronConfig;
  gateway?: GatewayConfig;
  heartbeat?: HeartbeatConfig;
  mcp?: McpConfig;
  mcpServers?: Record<string, McpServerEntry>;
  paths?: PathsConfig;
  storage?: StorageConfig;
}

/**
 * Resolve a model profile by name (defaults to agent.primary).
 * Throws if the profile doesn't exist in the models map.
 */
export function resolveModel(config: VargosConfig, name?: string): ModelProfile {
  const profileName = name ?? config.agent.primary;
  const profile = config.models[profileName];
  if (!profile) {
    throw new Error(`Model profile "${profileName}" not found — available: ${Object.keys(config.models).join(', ')}`);
  }
  return profile;
}

export function getConfigPath(dataDir: string): string {
  return path.join(dataDir, CONFIG_FILE);
}

export function getPiConfigPaths(workspaceDir: string): {
  authPath: string;
  settingsPath: string;
  modelsPath: string;
  agentDir: string;
} {
  const agentDir = path.join(workspaceDir, PI_AGENT_DIR);
  return {
    agentDir,
    authPath: path.join(agentDir, AUTH_FILE),
    settingsPath: path.join(workspaceDir, SETTINGS_FILE),
    modelsPath: path.join(agentDir, MODELS_FILE),
  };
}

/**
 * Load config.json from dataDir — returns null if missing.
 * Migrates legacy formats on first read:
 *   1. ~/.vargos/config.json (current or legacy inline agent) → return
 *   2. ~/.vargos/workspace/config.json (flat) → migrate
 *   3. ~/.vargos/workspace/settings.json + agent/auth.json (legacy Pi SDK) → migrate
 *   4. ~/.vargos/channels.json → merge into channels section
 */
export async function loadConfig(dataDir: string): Promise<VargosConfig | null> {
  const configPath = getConfigPath(dataDir);

  // Try reading config.json
  try {
    const raw = JSON.parse(await fs.readFile(configPath, 'utf-8'));

    // Current format — has models map
    if (raw.models && raw.agent?.primary) return raw as VargosConfig;

    // Legacy inline agent format — migrate to profiles
    if (raw.agent?.provider) {
      const config = migrateInlineAgent(raw);
      await saveConfig(dataDir, config);
      return config;
    }
  } catch { /* missing or invalid */ }

  // Migration: flat workspace/config.json → nested
  const workspaceDir = path.join(dataDir, 'workspace');
  const flatProfile = await readFlatConfig(workspaceDir);
  if (flatProfile) {
    const config = buildConfigFromProfile(flatProfile);
    const channels = await readLegacyChannels(dataDir);
    if (channels) config.channels = channels;
    await saveConfig(dataDir, config);
    await safeRename(path.join(workspaceDir, CONFIG_FILE));
    await safeRename(path.join(dataDir, 'channels.json'));
    return config;
  }

  // Migration: legacy Pi SDK settings.json + auth.json
  const legacyProfile = await migrateLegacyPiSdk(workspaceDir);
  if (legacyProfile) {
    const config = buildConfigFromProfile(legacyProfile);
    const channels = await readLegacyChannels(dataDir);
    if (channels) config.channels = channels;
    await saveConfig(dataDir, config);
    await safeRename(path.join(dataDir, 'channels.json'));
    return config;
  }

  // Migration: channels-only (no agent config found)
  const channels = await readLegacyChannels(dataDir);
  if (channels) {
    await safeRename(path.join(dataDir, 'channels.json'));
  }

  return null;
}

export async function saveConfig(dataDir: string, config: VargosConfig): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    getConfigPath(dataDir),
    JSON.stringify(config, null, 2),
    'utf-8',
  );
}

// -- Migration helpers --

/** Migrate old { agent: { provider, model, apiKey } } → models map */
function migrateInlineAgent(raw: Record<string, unknown>): VargosConfig {
  const oldAgent = raw.agent as ModelProfile;
  const profileName = oldAgent.provider;
  const profile: ModelProfile = { provider: oldAgent.provider, model: oldAgent.model };
  if (oldAgent.apiKey) profile.apiKey = oldAgent.apiKey;
  if (oldAgent.baseUrl) profile.baseUrl = oldAgent.baseUrl;

  const config: VargosConfig = {
    models: { [profileName]: profile },
    agent: { primary: profileName },
  };

  // Preserve other top-level fields
  for (const key of Object.keys(raw)) {
    if (key === 'agent') continue;
    (config as unknown as Record<string, unknown>)[key] = raw[key];
  }

  return config;
}

/** Build a fresh config from a single profile (used by legacy migrations) */
function buildConfigFromProfile(profile: ModelProfile): VargosConfig {
  return {
    models: { [profile.provider]: profile },
    agent: { primary: profile.provider },
  };
}

/** Read old flat config.json from workspace dir */
async function readFlatConfig(workspaceDir: string): Promise<ModelProfile | null> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(workspaceDir, CONFIG_FILE), 'utf-8'));
    if (raw.provider && raw.model && !raw.agent) {
      const profile: ModelProfile = { provider: raw.provider, model: raw.model };
      if (raw.apiKey) profile.apiKey = raw.apiKey;
      if (raw.baseUrl) profile.baseUrl = raw.baseUrl;
      return profile;
    }
  } catch { /* missing */ }
  return null;
}

/** Read legacy Pi SDK settings.json + agent/auth.json */
async function migrateLegacyPiSdk(workspaceDir: string): Promise<ModelProfile | null> {
  const { settingsPath, authPath } = getPiConfigPaths(workspaceDir);

  let provider: string | undefined;
  let model: string | undefined;
  let apiKey: string | undefined;

  try {
    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8')) as { defaultProvider?: string; defaultModel?: string };
    provider = settings.defaultProvider;
    model = settings.defaultModel;
  } catch { /* missing */ }

  if (!provider || !model) return null;

  try {
    const auth = JSON.parse(await fs.readFile(authPath, 'utf-8')) as Record<string, { apiKey?: string }>;
    apiKey = auth[provider]?.apiKey;
  } catch { /* missing */ }

  await safeRename(settingsPath);
  await safeRename(authPath);

  const profile: ModelProfile = { provider, model };
  if (apiKey) profile.apiKey = apiKey;
  return profile;
}

/** Read legacy channels.json array format → record format */
async function readLegacyChannels(dataDir: string): Promise<Record<string, ChannelEntry> | null> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(dataDir, 'channels.json'), 'utf-8'));
    const arr = raw.channels as Array<{ type: string; enabled?: boolean; botToken?: string; allowFrom?: string[] }>;
    if (!Array.isArray(arr) || arr.length === 0) return null;

    const result: Record<string, ChannelEntry> = {};
    for (const ch of arr) {
      const entry: ChannelEntry = {};
      if (ch.enabled !== undefined) entry.enabled = ch.enabled;
      if (ch.botToken) entry.botToken = ch.botToken;
      if (ch.allowFrom) entry.allowFrom = ch.allowFrom;
      result[ch.type] = entry;
    }
    return result;
  } catch { /* missing */ }
  return null;
}

async function safeRename(filePath: string): Promise<void> {
  try {
    await fs.rename(filePath, filePath + '.bak');
  } catch { /* already gone */ }
}
