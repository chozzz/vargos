import { select, text, isCancel } from '@clack/prompts';
import chalk from 'chalk';
import { loadAndValidate } from '../boot.js';
import { resolveDataDir } from '../../config/paths.js';
import { loadConfig, saveConfig, type AgentConfig, type VargosConfig } from '../../config/pi-config.js';
import { LOCAL_PROVIDERS } from '../../config/validate.js';

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o', anthropic: 'claude-3-5-sonnet-20241022',
  google: 'gemini-1.5-pro', openrouter: 'openai/gpt-4o',
  ollama: 'llama3.2', lmstudio: 'default',
};

function maskKey(key: string): string {
  return key.length > 3 ? '****' + key.slice(-3) : '****';
}

export async function show(): Promise<void> {
  const { config } = await loadAndValidate();
  const { provider, model, apiKey, baseUrl } = config.agent;

  console.log(`\n  ${chalk.bold('LLM Configuration')}\n`);
  console.log(`    ${chalk.gray('Provider')}   ${provider}`);
  console.log(`    ${chalk.gray('Model')}      ${model}`);
  if (apiKey) console.log(`    ${chalk.gray('API Key')}    ${maskKey(apiKey)}`);
  if (baseUrl) console.log(`    ${chalk.gray('Base URL')}   ${baseUrl}`);
  console.log();
}

export async function edit(): Promise<void> {
  const dataDir = resolveDataDir();
  const existing = await loadConfig(dataDir);
  const agent: AgentConfig = existing?.agent ?? { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' };

  const provider = await select({
    message: 'Provider',
    options: [
      { value: 'openai', label: 'OpenAI' },
      { value: 'anthropic', label: 'Anthropic' },
      { value: 'google', label: 'Google' },
      { value: 'openrouter', label: 'OpenRouter' },
      { value: 'ollama', label: 'Ollama (local)' },
      { value: 'lmstudio', label: 'LM Studio (local)' },
    ],
    initialValue: agent.provider,
  });
  if (isCancel(provider)) process.exit(0);

  const model = await text({
    message: 'Model',
    defaultValue: DEFAULT_MODELS[provider] ?? agent.model,
    placeholder: DEFAULT_MODELS[provider] ?? agent.model,
  });
  if (isCancel(model)) process.exit(0);

  agent.provider = provider;
  agent.model = model;

  if (LOCAL_PROVIDERS.has(provider)) {
    const defaultUrl = provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234';
    const baseUrl = await text({
      message: 'Base URL',
      defaultValue: agent.baseUrl ?? defaultUrl,
      placeholder: defaultUrl,
    });
    if (isCancel(baseUrl)) process.exit(0);
    agent.baseUrl = baseUrl;
    delete agent.apiKey;
  } else {
    const apiKey = await text({
      message: 'API Key',
      placeholder: agent.apiKey ? maskKey(agent.apiKey) : 'sk-...',
    });
    if (isCancel(apiKey)) process.exit(0);
    if (apiKey) agent.apiKey = apiKey;
    delete agent.baseUrl;
  }

  const config: VargosConfig = existing ? { ...existing, agent } : { agent };
  await saveConfig(dataDir, config);
  console.log(chalk.green('\n  Config saved.\n'));
}
