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
import { getPiConfigPaths, type CompactionConfig } from '../config/pi-config.js';
import { LOCAL_PROVIDERS } from '../config/validate.js';
import { createContextPruningExtension } from './extensions/context-pruning.js';
import { createCompactionSafeguardExtension } from './extensions/compaction-safeguard.js';
import { createLogger } from '../lib/logger.js';
import { promises as fs } from 'node:fs';

const log = createLogger('runtime');

export const PROVIDER_BASE_URLS: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://127.0.0.1:11434/v1',
  lmstudio: 'http://127.0.0.1:1234/v1',
  groq: 'https://api.groq.com/openai/v1',
  together: 'https://api.together.xyz/v1',
  deepseek: 'https://api.deepseek.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  perplexity: 'https://api.perplexity.ai',
};

export function resolveProviderBaseUrl(provider: string, configBaseUrl?: string): string | undefined {
  if (configBaseUrl) {
    const raw = configBaseUrl.replace(/\/$/, '');
    return raw.endsWith('/v1') ? raw : raw + '/v1';
  }
  return PROVIDER_BASE_URLS[provider];
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
}

export interface PiSessionResult {
  session: AgentSession;
  sessionManager: SessionManager;
}

export async function buildPiSession(config: PiSessionConfig): Promise<PiSessionResult> {
  const piPaths = getPiConfigPaths(config.workspaceDir);
  await fs.mkdir(piPaths.agentDir, { recursive: true });

  const sessionManager = SessionManager.inMemory(config.workspaceDir);
  const authStorage = new AuthStorage(piPaths.authPath);
  const provider = config.provider ?? 'openai';

  if (config.apiKey) {
    authStorage.setRuntimeApiKey(provider, config.apiKey);
  } else if (LOCAL_PROVIDERS.has(provider)) {
    authStorage.setRuntimeApiKey(provider, 'local');
  }

  const modelRegistry = new ModelRegistry(authStorage, piPaths.modelsPath);
  const settings = SettingsManager.create(config.workspaceDir, piPaths.agentDir);

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

  const vargosCustomTools = createVargosCustomTools(config.workspaceDir, config.sessionKey);
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
    agentDir: piPaths.agentDir,
    settingsManager: settings,
    extensionFactories,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
  });
  await resourceLoader.reload();

  log.debug(`Creating agent session: workspace=${config.workspaceDir}`);
  const { session } = await createAgentSession({
    cwd: config.workspaceDir,
    agentDir: piPaths.agentDir,
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
