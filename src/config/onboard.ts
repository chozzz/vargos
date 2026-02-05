/**
 * Interactive configuration prompts
 */

import readline from 'node:readline';
import { loadConfig, saveConfig, type AgentConfig, type VargosConfig } from './pi-config.js';

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function getProviderLink(provider: string): string {
  const links: Record<string, string> = {
    openai: 'https://platform.openai.com/api-keys',
    anthropic: 'https://console.anthropic.com/',
    google: 'https://ai.google.dev/',
    openrouter: 'https://openrouter.ai/keys',
  };
  return links[provider] ?? '#';
}

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o', anthropic: 'claude-3-5-sonnet-20241022',
  google: 'gemini-1.5-pro', openrouter: 'openai/gpt-4o',
  ollama: 'llama3.2', lmstudio: 'default',
};

export async function interactivePiConfig(dataDir: string): Promise<void> {
  console.log('');
  console.log('  Agent Configuration');
  console.log('  ──────────────────────────');
  console.log('');

  const existing = await loadConfig(dataDir);

  if (existing) {
    console.log(`  Current: ${existing.agent.provider}/${existing.agent.model}`);
    const answer = await prompt('  Change? (y/n): ');
    if (answer.toLowerCase() !== 'y') return;
    console.log('');
  }

  console.log('  Select a provider:');
  console.log('    1. openai (GPT-4o, GPT-4o-mini)');
  console.log('    2. anthropic (Claude)');
  console.log('    3. google (Gemini)');
  console.log('    4. openrouter (Multi-provider)');
  console.log('    5. ollama (Self-hosted)');
  console.log('    6. lmstudio (Self-hosted)');
  console.log('');

  const choice = await prompt('    Choice (1-6): ');
  const providerMap: Record<string, string> = {
    '1': 'openai', '2': 'anthropic', '3': 'google',
    '4': 'openrouter', '5': 'ollama', '6': 'lmstudio',
  };

  const provider = providerMap[choice];
  if (!provider) {
    console.log('    Invalid choice, skipping agent config\n');
    return;
  }

  const agent: AgentConfig = { provider, model: '' };

  // Base URL for local providers
  if (provider === 'ollama' || provider === 'lmstudio') {
    const defaultUrl = provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234';
    console.log(`\n    Base URL (default: ${defaultUrl}):`);
    const urlInput = await prompt('    URL: ');
    agent.baseUrl = urlInput || defaultUrl;
  }

  // API key (skip for ollama)
  if (provider !== 'ollama') {
    console.log(`\n    Enter ${provider} API key:`);
    console.log(`    Get one at: ${getProviderLink(provider)}`);
    console.log('');

    const apiKey = await prompt(`    ${provider.toUpperCase()}_API_KEY: `);
    if (apiKey) {
      agent.apiKey = apiKey;
      console.log('    API key saved\n');
    }
  }

  console.log(`\n    Model ID (default: ${DEFAULT_MODELS[provider]}):`);
  const modelInput = await prompt('    Model: ');
  agent.model = modelInput || DEFAULT_MODELS[provider];

  const config: VargosConfig = { agent, channels: existing?.channels };
  await saveConfig(dataDir, config);
  console.log(`    Set: ${provider}/${agent.model}\n`);
}
