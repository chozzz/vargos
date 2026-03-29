import {
  createAgentSession,
  SessionManager,
  SettingsManager,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  type AgentSession,
  type ExtensionFactory,
} from '@mariozechner/pi-coding-agent';
import { createVargosCustomTools } from './extension.js';
import { createContextPruningExtension, type ContextPruningConfig } from './extensions/context-pruning.js';
import { createCompactionSafeguardExtension, type CompactionSafeguardConfig } from './extensions/compaction-safeguard.js';
import type { Bus } from '../../gateway/bus.js';
import { getDataPaths } from '../../lib/paths.js';
import { createLogger } from '../../lib/logger.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const log = createLogger('runtime');

// Providers that don't need a real API key
const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio']);

export const PROVIDER_BASE_URLS: Record<string, string> = {
  openrouter:  'https://openrouter.ai/api/v1',
  ollama:      'http://127.0.0.1:11434/v1',
  lmstudio:    'http://127.0.0.1:1234/v1',
  groq:        'https://api.groq.com/openai/v1',
  together:    'https://api.together.xyz/v1',
  deepseek:    'https://api.deepseek.com/v1',
  mistral:     'https://api.mistral.ai/v1',
  fireworks:   'https://api.fireworks.ai/inference/v1',
  perplexity:  'https://api.perplexity.ai',
};

export function resolveProviderBaseUrl(provider: string, configBaseUrl?: string): string | undefined {
  if (configBaseUrl) {
    const raw = configBaseUrl.replace(/\/$/, '');
    return raw.endsWith('/v1') ? raw : raw + '/v1';
  }
  return PROVIDER_BASE_URLS[provider];
}

export interface CompactionConfig {
  contextPruning?: ContextPruningConfig;
  safeguard?: CompactionSafeguardConfig;
}

export interface PiSessionConfig {
  workspaceDir: string;
  sessionKey: string;
  model?: string;
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  contextWindow?: number;
  compaction?: CompactionConfig;
  systemPrompt?: string;
  bus: Bus;
}

export interface PiSessionResult {
  session: AgentSession;
  sessionManager: SessionManager;
}

export async function buildPiSession(config: PiSessionConfig): Promise<PiSessionResult> {
  const { workspaceDir: wsDir } = getDataPaths();
  const agentDir = path.join(wsDir, 'agent');
  const authPath = path.join(agentDir, 'auth.json');
  const modelsPath = path.join(agentDir, 'models.json');

  await fs.mkdir(agentDir, { recursive: true });

  const sessionManager = SessionManager.inMemory(config.workspaceDir);
  const authStorage = new AuthStorage(authPath);
  const provider = config.provider ?? 'openai';

  if (config.apiKey) {
    authStorage.setRuntimeApiKey(provider, config.apiKey);
  } else if (LOCAL_PROVIDERS.has(provider)) {
    authStorage.setRuntimeApiKey(provider, 'local');
  }

  const modelRegistry = new ModelRegistry(authStorage, modelsPath);
  const settings = SettingsManager.create(config.workspaceDir, agentDir);

  let model = undefined;
  if (config.model) {
    model = modelRegistry.find(provider, config.model) ?? undefined;

    if (!model) {
      const baseUrl = resolveProviderBaseUrl(provider, config.baseUrl);
      const apiKey = config.apiKey ?? (LOCAL_PROVIDERS.has(provider) ? 'local' : undefined);

      if (baseUrl && apiKey) {
        const contextWindow = config.contextWindow ?? 128_000;
        const maxTokens = config.maxTokens ?? Math.min(16_384, contextWindow);
        log.info(`registering model: provider=${provider} model=${config.model} baseUrl=${baseUrl} maxTokens=${maxTokens}`);
        modelRegistry.registerProvider(provider, {
          baseUrl,
          apiKey,
          api: 'openai-completions',
          models: [{
            id: config.model,
            name: config.model,
            reasoning: false,
            input: ['text', 'image'] as ('text' | 'image')[],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow,
            maxTokens,
          }],
        });
        model = modelRegistry.find(provider, config.model) ?? undefined;
      }
    }
  }

  const vargosCustomTools = await createVargosCustomTools(config.sessionKey, config.bus);
  log.debug(`Created ${vargosCustomTools.length} custom tools`);

  const extensionFactories: ExtensionFactory[] = [];
  const compactionCfg = config.compaction;

  if (compactionCfg?.contextPruning?.enabled !== false) {
    extensionFactories.push(createContextPruningExtension(compactionCfg?.contextPruning));
  }
  if (compactionCfg?.safeguard?.enabled !== false) {
    extensionFactories.push(createCompactionSafeguardExtension(compactionCfg?.safeguard));
  }

  const resourceLoader = new DefaultResourceLoader({
    cwd: config.workspaceDir,
    agentDir,
    settingsManager: settings,
    extensionFactories,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    ...(config.systemPrompt && { systemPrompt: config.systemPrompt }),
    agentsFilesOverride: () => ({ agentsFiles: [] }),
  });
  await resourceLoader.reload();

  log.debug(`Creating agent session: workspace=${config.workspaceDir}`);
  const { session } = await createAgentSession({
    cwd: config.workspaceDir,
    agentDir,
    sessionManager,
    settingsManager: settings,
    authStorage,
    modelRegistry,
    model,
    tools: [],
    customTools: vargosCustomTools,
    resourceLoader,
  });

  return { session, sessionManager };
}
