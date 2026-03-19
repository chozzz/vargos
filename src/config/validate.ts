/**
 * Boot-time configuration validation
 * Fails fast so runtime errors don't surface minutes later
 */

import { resolveApiKey, type VargosConfig, type ModelProfile } from './pi-config.js';

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

  if (config.agent.media) {
    for (const [type, profileName] of Object.entries(config.agent.media)) {
      if (!config.models[profileName]) {
        warnings.push(`agent.media.${type} "${profileName}" not found in models`);
      }
    }
  }

  // Validate each model profile
  for (const [name, profile] of Object.entries(config.models)) {
    validateProfile(name, profile, errors);
  }

  // Subagent validation
  if (config.agent.subagents) {
    const sa = config.agent.subagents;
    if (sa.maxChildren !== undefined && (!Number.isInteger(sa.maxChildren) || sa.maxChildren < 1 || sa.maxChildren > 50)) {
      errors.push('agent.subagents.maxChildren must be an integer 1-50');
    }
    if (sa.maxSpawnDepth !== undefined && (!Number.isInteger(sa.maxSpawnDepth) || sa.maxSpawnDepth < 1 || sa.maxSpawnDepth > 5)) {
      errors.push('agent.subagents.maxSpawnDepth must be an integer 1-5');
    }
    if (sa.runTimeoutSeconds !== undefined && (typeof sa.runTimeoutSeconds !== 'number' || sa.runTimeoutSeconds < 0)) {
      errors.push('agent.subagents.runTimeoutSeconds must be a non-negative number');
    }
    if (sa.model && !config.models[sa.model]) {
      warnings.push(`agent.subagents.model "${sa.model}" not found in models`);
    }
  }

  // Channel validation
  if (config.channels) {
    const channelIds = new Set<string>();
    for (const ch of config.channels) {
      if (ch.type === 'telegram' && ch.enabled !== false && !ch.botToken) {
        warnings.push(`channels.${ch.id}: missing botToken — telegram will not work`);
      }
      if (ch.id && channelIds.has(ch.id)) {
        errors.push(`channels: duplicate channel id "${ch.id}"`);
      }
      if (ch.id) channelIds.add(ch.id);
      if (ch.model && !config.models[ch.model]) {
        warnings.push(`channels.${ch.id}: model "${ch.model}" not found in models`);
      }
    }
  }

  // Gateway validation
  if (config.gateway) {
    validatePort('gateway.port', config.gateway.port, errors);
  }

  // MCP validation
  if (config.mcp) {
    if (config.mcp.transport !== undefined && config.mcp.transport !== 'stdio' && config.mcp.transport !== 'http') {
      errors.push('mcp.transport must be "stdio" or "http"');
    }
    validatePort('mcp.port', config.mcp.port, errors);
    if (config.mcp.endpoint !== undefined && !config.mcp.endpoint.startsWith('/')) {
      errors.push('mcp.endpoint must start with /');
    }
    const mcpTransport = config.mcp.transport ?? 'http';
    if (mcpTransport === 'http' && !config.mcp.bearerToken) {
      warnings.push('mcp.bearerToken not set — MCP HTTP server will not start. Set mcp.bearerToken in config.json to enable it.');
    }
  }

  // Embedding validation
  if (config.embedding?.provider === 'openai') {
    const envKey = process.env['OPENAI_API_KEY'];
    if (!envKey && !config.embedding.apiKey) {
      warnings.push('embedding.provider is "openai" but no API key set — embeddings will fall back to local trigram hashing. Set embedding.apiKey or OPENAI_API_KEY env var.');
    }
  }

  // Webhook validation
  if (config.webhooks) {
    validatePort('webhooks.port', config.webhooks.port, errors);
    const hookIds = new Set<string>();
    for (const hook of config.webhooks.hooks ?? []) {
      if (!hook.id || !hook.token) {
        errors.push('webhooks.hooks: each hook requires id and token');
      }
      if (hook.id && !/^[a-z0-9_-]+$/i.test(hook.id)) {
        errors.push(`webhooks.hooks.${hook.id}: id must match [a-z0-9_-]+`);
      }
      if (hook.id && hookIds.has(hook.id)) {
        errors.push(`webhooks.hooks: duplicate hook id "${hook.id}"`);
      }
      if (hook.id) hookIds.add(hook.id);
    }
  }

  // Compaction validation
  if (config.compaction) {
    const cp = config.compaction.contextPruning;
    if (cp) {
      if (cp.keepLastAssistants !== undefined && (!Number.isInteger(cp.keepLastAssistants) || cp.keepLastAssistants < 0)) {
        errors.push('compaction.contextPruning.keepLastAssistants must be a non-negative integer');
      }
      validateRatio('compaction.contextPruning.softTrimRatio', cp.softTrimRatio, errors);
      validateRatio('compaction.contextPruning.hardClearRatio', cp.hardClearRatio, errors);
    }
    const sg = config.compaction.safeguard;
    if (sg) {
      validateRatio('compaction.safeguard.maxHistoryShare', sg.maxHistoryShare, errors);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validatePort(section: string, port: unknown, errors: string[]): void {
  if (port !== undefined && (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65535)) {
    errors.push(`${section} must be an integer 1-65535`);
  }
}

function validateRatio(path: string, value: unknown, errors: string[]): void {
  if (value !== undefined && (typeof value !== 'number' || value < 0 || value > 1)) {
    errors.push(`${path} must be between 0 and 1`);
  }
}

function validateProfile(name: string, profile: ModelProfile, errors: string[]): void {
  if (!profile.provider) {
    errors.push(`models.${name}: missing provider`);
  }
  if (!profile.model) {
    errors.push(`models.${name}: missing model`);
  }

  if (!profile.provider) return;

  // Cloud providers need an API key
  if (!LOCAL_PROVIDERS.has(profile.provider) && !resolveApiKey(profile)) {
    errors.push(
      `models.${name}: missing API key — set apiKey in profile or ${profile.provider.toUpperCase()}_API_KEY env var`
    );
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
