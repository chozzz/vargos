/**
 * Boot-time configuration validation
 * Fails fast so runtime errors don't surface minutes later
 */

import type { VargosConfig } from './pi-config.js';

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

  // Agent section
  if (!config.agent) {
    errors.push('Missing "agent" section in config.json');
    return { valid: false, errors, warnings };
  }

  if (!config.agent.provider) {
    errors.push('Missing agent.provider — run: vargos config');
  }

  if (!config.agent.model) {
    errors.push('Missing agent.model — run: vargos config');
  }

  // API key — required for cloud providers, optional for local
  if (config.agent.provider && !LOCAL_PROVIDERS.has(config.agent.provider)) {
    const envKey = process.env[`${config.agent.provider.toUpperCase()}_API_KEY`];
    if (!envKey && !config.agent.apiKey) {
      errors.push(
        `Missing API key for ${config.agent.provider} — set agent.apiKey in config.json or ${config.agent.provider.toUpperCase()}_API_KEY env var`
      );
    }
  }

  // Local providers — check baseUrl format
  if (config.agent.provider && LOCAL_PROVIDERS.has(config.agent.provider)) {
    if (config.agent.baseUrl) {
      try {
        new URL(config.agent.baseUrl);
      } catch {
        errors.push(`Invalid agent.baseUrl: "${config.agent.baseUrl}" — must be a valid URL`);
      }
    }
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
