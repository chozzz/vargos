/**
 * Interactive configuration prompts
 */

import readline from 'node:readline';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  getPiConfigPaths,
  loadPiAuth,
  savePiAuth,
  loadPiSettings,
  savePiSettings,
  listPiProviders,
  isPiConfigured,
  formatPiConfigDisplay,
} from './pi-config.js';
import { checkConfig } from './validate.js';

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

async function interactivePiConfig(workspaceDir: string): Promise<void> {
  console.log('');
  console.log('Agent Configuration');
  console.log('─────────────────────────────────');
  console.log('');

  const piStatus = await isPiConfigured(workspaceDir);
  const providers = await listPiProviders(workspaceDir);
  const settings = await loadPiSettings(workspaceDir);

  console.log(
    formatPiConfigDisplay({
      provider: settings.defaultProvider,
      model: settings.defaultModel,
      apiKeys: providers,
    })
  );
  console.log('');

  if (!settings.defaultProvider) {
    console.log('Select a provider for the agent:');
    console.log('  1. openai (GPT-4o, GPT-4o-mini)');
    console.log('  2. anthropic (Claude)');
    console.log('  3. google (Gemini)');
    console.log('  4. openrouter (Multi-provider)');
    console.log('');

    const choice = await prompt('   Choice (1-4): ');
    const providerMap: Record<string, string> = {
      '1': 'openai',
      '2': 'anthropic',
      '3': 'google',
      '4': 'openrouter',
    };

    const provider = providerMap[choice];
    if (!provider) {
      console.log('   Invalid choice, skipping agent config\n');
      return;
    }

    const existingKey = providers.find((p) => p.provider === provider);
    if (!existingKey?.hasKey) {
      console.log(`\n   Enter ${provider} API key:`);
      console.log(`   Get one at: ${getProviderLink(provider)}`);
      console.log('');

      const apiKey = await prompt(`   ${provider.toUpperCase()}_API_KEY: `);
      if (apiKey) {
        const auth = await loadPiAuth(workspaceDir);
        auth[provider] = { apiKey };
        await savePiAuth(workspaceDir, auth);
        const { authPath } = getPiConfigPaths(workspaceDir);
        console.log(`   API key saved to ${authPath}\n`);
      }
    }

    const defaultModels: Record<string, string> = {
      openai: 'gpt-4o',
      anthropic: 'claude-3-5-sonnet-20241022',
      google: 'gemini-1.5-pro',
      openrouter: 'openai/gpt-4o',
    };

    console.log(`\n   Enter model ID (default: ${defaultModels[provider]}):`);
    const modelInput = await prompt('   Model: ');
    const model = modelInput || defaultModels[provider];

    await savePiSettings(workspaceDir, {
      ...settings,
      defaultProvider: provider,
      defaultModel: model,
    });

    console.log(`   Default model set: ${provider}/${model}\n`);
  } else if (!piStatus.hasApiKey) {
    const provider = settings.defaultProvider;
    console.log(`\n   ${provider} API key is missing.`);
    console.log(`   Get one at: ${getProviderLink(provider)}`);
    console.log('');

    const apiKey = await prompt(`   ${provider.toUpperCase()}_API_KEY: `);
    if (apiKey) {
      const auth = await loadPiAuth(workspaceDir);
      auth[provider] = { apiKey };
      await savePiAuth(workspaceDir, auth);
      const { authPath } = getPiConfigPaths(workspaceDir);
      console.log(`   API key saved to ${authPath}\n`);
    }
  } else {
    console.log('Agent configuration complete\n');
  }
}

export async function interactiveConfig(workspaceDir?: string): Promise<Record<string, string>> {
  const updates: Record<string, string> = {};
  const cwd = workspaceDir ?? process.cwd();

  console.log('');
  console.log('Vargos Configuration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const { missing, warnings } = checkConfig();

  if (warnings.length > 0) {
    console.log('Using defaults:');
    for (const warning of warnings) {
      console.log(`   ${warning}`);
    }
    console.log('');
  }

  if (missing.length > 0) {
    console.log(`${missing.length} configuration value(s) needed:\n`);

    for (const config of missing) {
      console.log(`${config.key}${config.required ? ' (required)' : ' (optional)'}`);
      console.log(`   Why: ${config.why}`);
      if (config.link) {
        console.log(`   Get one at: ${config.link}`);
      }
      console.log('');

      const defaultPart = config.defaultValue ? ` (default: ${config.defaultValue})` : '';
      const question = `   Enter ${config.key}${defaultPart}: `;

      let value = await prompt(question);

      if (!value && config.defaultValue) {
        value = config.defaultValue;
      }

      if (value && config.validate) {
        const valid = config.validate(value);
        if (typeof valid === 'string') {
          console.log(`   ${valid}`);
          const retry = await prompt(`   Retry ${config.key}: `);
          if (retry) value = retry;
        }
      }

      if (value) {
        updates[config.key] = value;
        process.env[config.key] = value;
      }

      console.log('');
    }
  }

  await interactivePiConfig(cwd);

  if (Object.keys(updates).length > 0) {
    const saveToEnv = await prompt('Save Vargos config to .env file? (Y/n): ');
    if (saveToEnv.toLowerCase() !== 'n') {
      await saveEnvFile(updates, cwd);
      console.log(`Configuration saved to ${path.join(cwd, '.env')}\n`);
    }
  }

  return updates;
}

async function saveEnvFile(updates: Record<string, string>, targetDir: string = process.cwd()): Promise<void> {
  const envPath = path.join(targetDir, '.env');

  let content = '';
  try {
    content = await fs.readFile(envPath, 'utf-8');
  } catch {
    // File doesn't exist
  }

  const lines = content.split('\n');
  if (lines.length === 1 && lines[0] === '') {
    lines.length = 0;
  }
  const existingKeys = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^([A-Z_]+)=/);
    if (match) {
      const key = match[1];
      existingKeys.add(key);
      if (updates[key] !== undefined) {
        lines[i] = `${key}=${updates[key]}`;
        delete updates[key];
      }
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!existingKeys.has(key)) {
      lines.push(`${key}=${value}`);
    }
  }

  await fs.writeFile(envPath, lines.join('\n'), 'utf-8');
}
