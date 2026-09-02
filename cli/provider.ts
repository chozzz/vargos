/**
 * LLM provider configuration — the one required piece of first-run setup.
 *
 * Writes the three files services/config reads: agent/models.json (provider
 * registry), agent/auth.json (credentials), agent/settings.json (defaultProvider
 * + defaultModel). The caller never sees three files — one Q&A fills all of them.
 *
 * Shared by the first-run journey (cli/ready.ts) and `vargos config` (cli/config-menu.ts).
 */

import { existsSync } from 'node:fs';
import * as p from '@clack/prompts';
import { getDataPaths } from '../lib/paths.js';
import { readJson, writeJson } from '../lib/util.js';

interface ProviderPreset {
  baseUrl: string;
  /** Pi SDK API type. */
  api: string;
  models?: Array<{ id: string; name: string }>;
  /** Env var checked for the key before prompting. */
  envKey?: string;
  /** Local providers don't need a key. */
  local?: boolean;
}

export const PROVIDERS: Record<string, ProviderPreset> = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    api: 'anthropic',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    ],
    envKey: 'ANTHROPIC_API_KEY',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    api: 'openai-completions',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'o3', name: 'o3' },
    ],
    envKey: 'OPENAI_API_KEY',
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    api: 'openai-completions',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    ],
    envKey: 'GOOGLE_API_KEY',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    api: 'openai-completions',
    models: [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4 (OpenRouter)' },
      { id: 'openai/gpt-4o', name: 'GPT-4o (OpenRouter)' },
    ],
    envKey: 'OPENROUTER_API_KEY',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    api: 'openai-completions',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
    ],
    envKey: 'DEEPSEEK_API_KEY',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    api: 'openai-completions',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B' },
    ],
    envKey: 'GROQ_API_KEY',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    api: 'openai-completions',
    models: [{ id: 'llama3.2', name: 'Llama 3.2' }],
    local: true,
  },
};

interface ModelsFile {
  providers?: Record<
    string,
    { baseUrl?: string; api?: string; apiKey?: string; models?: Array<{ id: string; name?: string }> }
  >;
}
interface SettingsFile {
  defaultProvider?: string;
  defaultModel?: string;
}

/**
 * Cheap, side-effect free: does `~/.vargos/agent/` name a default provider + model
 * that could actually run? Deliberately permissive — the daemon does the real
 * validation on boot. It only needs to be sure the setup journey isn't sending a
 * working install back through the wizard.
 */
export function providerReady(): boolean {
  const { configFile, dataDir } = getDataPaths();
  if (!existsSync(configFile)) return false;

  const agentDir = `${dataDir}/agent`;
  const settings = readJson<SettingsFile>(`${agentDir}/settings.json`);
  const provider = settings?.defaultProvider;

  if (!provider || !settings?.defaultModel) return false;

  // Credentials can live in any of three places, and a provider need not appear
  // in the user's models.json at all — Pi SDK ships built-ins (anthropic, openai,
  // google, deepseek, …) that only need an auth.json entry.
  const models = readJson<ModelsFile>(`${agentDir}/models.json`);
  const entry = models?.providers?.[provider];
  if (entry?.apiKey) return true;                       // inline key in models.json

  const auth = readJson<Record<string, unknown>>(`${agentDir}/auth.json`);
  if (auth?.[provider]) return true;                    // credentials in auth.json

  const preset = PROVIDERS[provider];
  if (preset?.local) return true;                       // local preset — no key needed
  if (preset?.envKey && process.env[preset.envKey]) return true; // key in the env

  // A provider the user declared in models.json (with a baseUrl) but no visible
  // key — trust it; the daemon does the real validation on boot.
  return !!entry;
}

function unwrap<T>(v: T | symbol): T {
  if (p.isCancel(v)) {
    p.cancel('Setup cancelled — run "vargos" to resume.');
    process.exit(0);
  }
  return v as T;
}

/**
 * Interactive provider setup. Writes all three files. Returns the chosen
 * provider + model. `reconfigure` pre-selects from the current settings.
 */
export async function configureProvider(): Promise<{ provider: string; model: string }> {
  const { configFile, dataDir } = getDataPaths();
  const agentDir = `${dataDir}/agent`;

  const providerKey = unwrap(await p.select({
    message: 'LLM provider',
    options: Object.entries(PROVIDERS).map(([key, preset]) => ({
      value: key,
      label: preset.local ? `${key} (local)` : key,
      hint: preset.baseUrl,
    })),
  })) as string;

  const preset = PROVIDERS[providerKey];

  // Credentials — env var wins, otherwise prompt (skip for local).
  let apiKey: string | undefined;
  if (preset.envKey && process.env[preset.envKey]) {
    p.log.info(`Using ${preset.envKey} from the environment.`);
    apiKey = process.env[preset.envKey];
  } else if (!preset.local) {
    apiKey = unwrap(await p.password({
      message: `${providerKey} API key`,
      validate: (v) => (v ? undefined : 'Required'),
    })) as string;
  }

  // Base URL — only asked for local (where it varies).
  let baseUrl = preset.baseUrl;
  if (preset.local) {
    baseUrl = (unwrap(await p.text({
      message: `${providerKey} base URL`,
      placeholder: preset.baseUrl,
      defaultValue: preset.baseUrl,
    })) as string) || preset.baseUrl;
  }

  // Model.
  let model: string;
  if (preset.models?.length) {
    model = unwrap(await p.select({
      message: 'Default model',
      options: preset.models.map((m) => ({ value: m.id, label: m.name })),
    })) as string;
  } else {
    model = unwrap(await p.text({
      message: 'Model ID',
      placeholder: 'e.g. gpt-4o',
      validate: (v) => (v ? undefined : 'Required'),
    })) as string;
  }

  // ── Write all three files ────────────────────────────────────────────────
  const spin = p.spinner();
  spin.start('Writing configuration');

  if (!existsSync(configFile)) writeJson(configFile, { gateway: {} });

  const models = readJson<ModelsFile>(`${agentDir}/models.json`) ?? {};
  models.providers = {
    ...models.providers,
    [providerKey]: { baseUrl, api: preset.api, ...(preset.models ? { models: preset.models } : {}) },
  };
  writeJson(`${agentDir}/models.json`, models);

  if (apiKey) {
    const auth = readJson<Record<string, unknown>>(`${agentDir}/auth.json`) ?? {};
    auth[providerKey] = { type: 'api_key', key: apiKey };
    writeJson(`${agentDir}/auth.json`, auth);
  }

  // settings.json — derived, never a separate prompt.
  const settings = readJson<SettingsFile>(`${agentDir}/settings.json`) ?? {};
  settings.defaultProvider = providerKey;
  settings.defaultModel = model;
  writeJson(`${agentDir}/settings.json`, settings);

  spin.stop(`${providerKey} · ${model}`);
  return { provider: providerKey, model };
}
