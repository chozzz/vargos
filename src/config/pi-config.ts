/**
 * Pi Agent Configuration Manager
 * Bridges Vargos config with Pi SDK's auth.json and settings.json
 * Everything is a file - reuse Pi's configuration files
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const PI_AGENT_DIR = '.vargos/agent';
const AUTH_FILE = 'auth.json';
const SETTINGS_FILE = 'settings.json';
const MODELS_FILE = 'models.json';

export interface PiAuthConfig {
  openai?: { apiKey: string };
  anthropic?: { apiKey: string };
  google?: { apiKey: string };
  [provider: string]: { apiKey: string } | undefined;
}

export interface PiSettings {
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  compactionEnabled?: boolean;
}

export interface PiModelConfig {
  provider: string;
  modelId: string;
  displayName?: string;
  contextWindow?: number;
}

/**
 * Get paths to Pi config files
 */
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
 * Ensure Pi agent directory exists
 */
export async function ensurePiAgentDir(workspaceDir: string): Promise<void> {
  const { agentDir } = getPiConfigPaths(workspaceDir);
  await fs.mkdir(agentDir, { recursive: true });
}

/**
 * Load Pi auth.json
 */
export async function loadPiAuth(workspaceDir: string): Promise<PiAuthConfig> {
  const { authPath } = getPiConfigPaths(workspaceDir);
  try {
    const content = await fs.readFile(authPath, 'utf-8');
    return JSON.parse(content) as PiAuthConfig;
  } catch {
    return {};
  }
}

/**
 * Save Pi auth.json
 */
export async function savePiAuth(
  workspaceDir: string,
  auth: PiAuthConfig
): Promise<void> {
  const { authPath } = getPiConfigPaths(workspaceDir);
  await ensurePiAgentDir(workspaceDir);
  await fs.writeFile(authPath, JSON.stringify(auth, null, 2), 'utf-8');
}

/**
 * Load Pi settings.json
 */
export async function loadPiSettings(workspaceDir: string): Promise<PiSettings> {
  const { settingsPath } = getPiConfigPaths(workspaceDir);
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    return JSON.parse(content) as PiSettings;
  } catch {
    return {};
  }
}

/**
 * Save Pi settings.json
 */
export async function savePiSettings(
  workspaceDir: string,
  settings: PiSettings
): Promise<void> {
  const { settingsPath } = getPiConfigPaths(workspaceDir);
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Set API key for a provider
 */
export async function setPiApiKey(
  workspaceDir: string,
  provider: string,
  apiKey: string
): Promise<void> {
  const auth = await loadPiAuth(workspaceDir);
  auth[provider] = { apiKey };
  await savePiAuth(workspaceDir, auth);
}

/**
 * Get API key for a provider (from file or environment)
 */
export async function getPiApiKey(
  workspaceDir: string,
  provider: string
): Promise<string | undefined> {
  // Check environment first
  const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  if (envKey) return envKey;

  // Check auth.json
  const auth = await loadPiAuth(workspaceDir);
  return auth[provider]?.apiKey;
}

/**
 * Set default model and provider
 */
export async function setPiDefaultModel(
  workspaceDir: string,
  provider: string,
  modelId: string
): Promise<void> {
  const settings = await loadPiSettings(workspaceDir);
  settings.defaultProvider = provider;
  settings.defaultModel = modelId;
  await savePiSettings(workspaceDir, settings);
}

/**
 * Get default model configuration
 */
export async function getPiDefaultModel(
  workspaceDir: string
): Promise<{ provider?: string; model?: string }> {
  const settings = await loadPiSettings(workspaceDir);
  return {
    provider: settings.defaultProvider,
    model: settings.defaultModel,
  };
}

/**
 * List configured providers with API keys
 */
export async function listPiProviders(
  workspaceDir: string
): Promise<Array<{ provider: string; hasKey: boolean; source: 'env' | 'file' | 'none' }>> {
  const auth = await loadPiAuth(workspaceDir);
  const providers = ['openai', 'anthropic', 'google', 'openrouter'];

  return providers.map((provider) => {
    const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
    const fileKey = auth[provider]?.apiKey;

    if (envKey) {
      return { provider, hasKey: true, source: 'env' as const };
    }
    if (fileKey) {
      return { provider, hasKey: true, source: 'file' as const };
    }
    return { provider, hasKey: false, source: 'none' as const };
  });
}

/**
 * Check if Pi agent is configured
 */
export async function isPiConfigured(
  workspaceDir: string
): Promise<{ configured: boolean; hasModel: boolean; hasApiKey: boolean; provider?: string }> {
  const providers = await listPiProviders(workspaceDir);
  const hasApiKey = providers.some((p) => p.hasKey);
  const settings = await loadPiSettings(workspaceDir);
  const hasModel = !!(settings.defaultProvider && settings.defaultModel);

  return {
    configured: hasApiKey && hasModel,
    hasModel,
    hasApiKey,
    provider: settings.defaultProvider,
  };
}

/**
 * Format config for display (mask API keys)
 */
export function formatPiConfigDisplay(config: {
  provider?: string;
  model?: string;
  apiKeys: Array<{ provider: string; source: 'env' | 'file' | 'none' }>;
}): string {
  const lines: string[] = [];

  lines.push('🤖 Agent Configuration:');
  lines.push(`  Provider: ${config.provider ?? 'Not set'}`);
  lines.push(`  Model: ${config.model ?? 'Not set'}`);
  lines.push('');
  lines.push('🔑 API Keys:');

  for (const key of config.apiKeys) {
    const status = key.source === 'none' ? '❌' : '✅';
    const source = key.source === 'env' ? '(env)' : key.source === 'file' ? '(file)' : '';
    lines.push(`  ${status} ${key.provider} ${source}`);
  }

  return lines.join('\n');
}
