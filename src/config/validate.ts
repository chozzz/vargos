/**
 * Boot-time configuration validation
 * Fails fast so runtime errors don't surface minutes later
 */

import type { VargosConfig, ModelProfile } from './pi-config.js';

export const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio']);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate loaded config before proceeding with boot.
 * Returns errors (fatal) and warnings (informational).
 */
export function validateConfig(config: VargosConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Models section
  if (!config.models || Object.keys(config.models).length === 0) {
    errors.push('No model profiles defined — run: vargos config llm edit');
    return { valid: false, errors, warnings };
  }

  // Agent section
  if (!config.agent?.primary) {
    errors.push('Missing agent.primary — run: vargos config llm edit');
    return { valid: false, errors, warnings };
  }

  if (!config.models[config.agent.primary]) {
    errors.push(`agent.primary "${config.agent.primary}" not found in models — available: ${Object.keys(config.models).join(', ')}`);
  }

  if (config.agent.fallback && !config.models[config.agent.fallback]) {
    warnings.push(`agent.fallback "${config.agent.fallback}" not found in models`);
  }

  // Validate each model profile
  for (const [name, profile] of Object.entries(config.models)) {
    validateProfile(name, profile, errors, warnings);
  }

  // Channel validation
  if (config.channels) {
    for (const [type, ch] of Object.entries(config.channels)) {
      if (type === 'telegram' && ch.enabled !== false && !ch.botToken) {
        warnings.push(`channels.${type}: missing botToken — telegram will not work`);
      }
    }
  }

  // Gateway validation
  if (config.gateway) {
    if (config.gateway.port !== undefined) {
      if (!Number.isInteger(config.gateway.port) || config.gateway.port < 1 || config.gateway.port > 65535) {
        errors.push('gateway.port must be an integer 1-65535');
      }
    }
  }

  // MCP validation
  if (config.mcp) {
    if (config.mcp.transport !== undefined && config.mcp.transport !== 'stdio' && config.mcp.transport !== 'http') {
      errors.push('mcp.transport must be "stdio" or "http"');
    }
    if (config.mcp.port !== undefined) {
      if (!Number.isInteger(config.mcp.port) || config.mcp.port < 1 || config.mcp.port > 65535) {
        errors.push('mcp.port must be an integer 1-65535');
      }
    }
    if (config.mcp.endpoint !== undefined && !config.mcp.endpoint.startsWith('/')) {
      errors.push('mcp.endpoint must start with /');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateProfile(name: string, profile: ModelProfile, errors: string[], _warnings: string[]): void {
  if (!profile.provider) {
    errors.push(`models.${name}: missing provider`);
  }
  if (!profile.model) {
    errors.push(`models.${name}: missing model`);
  }

  if (!profile.provider) return;

  // Cloud providers need an API key
  if (!LOCAL_PROVIDERS.has(profile.provider)) {
    const envKey = process.env[`${profile.provider.toUpperCase()}_API_KEY`];
    if (!envKey && !profile.apiKey) {
      errors.push(
        `models.${name}: missing API key — set apiKey in profile or ${profile.provider.toUpperCase()}_API_KEY env var`
      );
    }
  }

  // Local providers — check baseUrl format
  if (LOCAL_PROVIDERS.has(profile.provider) && profile.baseUrl) {
    try {
      new URL(profile.baseUrl);
    } catch {
      errors.push(`models.${name}: invalid baseUrl "${profile.baseUrl}" — must be a valid URL`);
    }
  }
}

/**
 * Check if a local provider (ollama/lmstudio) is reachable.
 * Non-blocking — returns warning string or null.
 */
export async function checkLocalProvider(
  provider: string,
  baseUrl?: string,
): Promise<string | null> {
  if (!LOCAL_PROVIDERS.has(provider)) return null;

  const defaultUrl = provider === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:1234';
  const url = baseUrl ?? defaultUrl;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return `${provider} at ${url} returned ${res.status}`;
    return null;
  } catch {
    return `Cannot reach ${provider} at ${url} — is it running?`;
  }
}
