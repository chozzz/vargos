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

export interface AgentConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

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

export interface VargosConfig {
  agent: AgentConfig;
  channels?: Record<string, ChannelEntry>;
  gateway?: GatewayConfig;
  mcp?: McpConfig;
  paths?: PathsConfig;
  storage?: StorageConfig;
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
 *   1. ~/.vargos/config.json (new nested) → return
 *   2. ~/.vargos/workspace/config.json (flat) → migrate
 *   3. ~/.vargos/workspace/settings.json + agent/auth.json (legacy Pi SDK) → migrate
 *   4. ~/.vargos/channels.json → merge into channels section
 */
export async function loadConfig(dataDir: string): Promise<VargosConfig | null> {
  const configPath = getConfigPath(dataDir);

  // Try reading new nested format
  try {
    const raw = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    if (raw.agent) return raw as VargosConfig;
  } catch { /* missing or invalid */ }

  // Migration: flat workspace/config.json → nested
  const workspaceDir = path.join(dataDir, 'workspace');
  const flatConfig = await readFlatConfig(workspaceDir);
  if (flatConfig) {
    const config: VargosConfig = { agent: flatConfig };
    // Also pull in channels.json if present
    const channels = await readLegacyChannels(dataDir);
    if (channels) config.channels = channels;
    await saveConfig(dataDir, config);
    await safeRename(path.join(workspaceDir, CONFIG_FILE));
    await safeRename(path.join(dataDir, 'channels.json'));
    return config;
  }

  // Migration: legacy Pi SDK settings.json + auth.json
  const legacyAgent = await migrateLegacyPiSdk(workspaceDir);
  if (legacyAgent) {
    const config: VargosConfig = { agent: legacyAgent };
    const channels = await readLegacyChannels(dataDir);
    if (channels) config.channels = channels;
    await saveConfig(dataDir, config);
    await safeRename(path.join(dataDir, 'channels.json'));
    return config;
  }

  // Migration: channels-only (no agent config found)
  const channels = await readLegacyChannels(dataDir);
  if (channels) {
    // Can't create a valid config without agent section
    // Rename channels.json but return null so wizard runs
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

/** Read old flat config.json from workspace dir */
async function readFlatConfig(workspaceDir: string): Promise<AgentConfig | null> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(workspaceDir, CONFIG_FILE), 'utf-8'));
    // Flat format has provider/model at top level (no .agent wrapper)
    if (raw.provider && raw.model && !raw.agent) {
      const agent: AgentConfig = { provider: raw.provider, model: raw.model };
      if (raw.apiKey) agent.apiKey = raw.apiKey;
      if (raw.baseUrl) agent.baseUrl = raw.baseUrl;
      return agent;
    }
  } catch { /* missing */ }
  return null;
}

/** Read legacy Pi SDK settings.json + agent/auth.json */
async function migrateLegacyPiSdk(workspaceDir: string): Promise<AgentConfig | null> {
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

  const agent: AgentConfig = { provider, model };
  if (apiKey) agent.apiKey = apiKey;
  return agent;
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
