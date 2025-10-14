/**
 * Interactive configuration prompt utility
 * Bridges Vargos config with Pi SDK's auth.json and settings.json
 */

import readline from 'node:readline';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  loadPiAuth,
  savePiAuth,
  loadPiSettings,
  savePiSettings,
  listPiProviders,
  isPiConfigured,
  formatPiConfigDisplay,
} from './pi-config.js';

export interface ConfigPrompt {
  key: string;
  required: boolean;
  defaultValue?: string;
  description: string;
  why: string;
  link?: string;
  validate?: (value: string) => boolean | string;
}

const CONFIG_PROMPTS: ConfigPrompt[] = [
  {
    key: 'OPENAI_API_KEY',
    required: false,
    description: 'OpenAI API Key',
    why: 'Required for Qdrant embeddings (semantic memory search). Not needed for file backend.',
    link: 'https://platform.openai.com/api-keys',
    validate: (v) => v.startsWith('sk-') || 'API key should start with sk-',
  },
  {
    key: 'QDRANT_URL',
    required: false,
    defaultValue: 'http://localhost:6333',
    description: 'Qdrant URL',
    why: 'Qdrant provides vector search for semantic memory. Only needed if using Qdrant backend.',
  },
  {
    key: 'POSTGRES_URL',
    required: false,
    description: 'PostgreSQL URL',
    why: 'PostgreSQL provides durable session storage. Only needed if using Postgres backend.',
    validate: (v) => v.startsWith('postgresql://') || 'URL should start with postgresql://',
  },
];

/**
 * Prompt user for input
 */
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

/**
 * Check if configuration is complete
 */
export function checkConfig(): {
  valid: boolean;
  missing: ConfigPrompt[];
  warnings: string[];
} {
  const memoryBackend = process.env.VARGOS_MEMORY_BACKEND ?? 'file';
  const sessionsBackend = process.env.VARGOS_SESSIONS_BACKEND ?? 'file';

  const missing: ConfigPrompt[] = [];
  const warnings: string[] = [];

  // Check OpenAI key if using Qdrant
  if (memoryBackend === 'qdrant' && !process.env.OPENAI_API_KEY) {
    missing.push(CONFIG_PROMPTS.find((p) => p.key === 'OPENAI_API_KEY')!);
  }

  // Check Qdrant URL if using Qdrant
  if (memoryBackend === 'qdrant' && !process.env.QDRANT_URL) {
    const prompt = CONFIG_PROMPTS.find((p) => p.key === 'QDRANT_URL')!;
    missing.push(prompt);
  }

  // Check Postgres URL if using Postgres
  if (sessionsBackend === 'postgres' && !process.env.POSTGRES_URL) {
    missing.push(CONFIG_PROMPTS.find((p) => p.key === 'POSTGRES_URL')!);
  }

  // Warnings for optional improvements
  if (!process.env.VARGOS_WORKSPACE) {
    warnings.push('VARGOS_WORKSPACE not set, using current directory');
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Interactive Pi agent configuration
 */
async function interactivePiConfig(workspaceDir: string): Promise<void> {
  console.log('');
  console.log('🤖 Agent Configuration');
  console.log('─────────────────────────────────');
  console.log('');

  const piStatus = await isPiConfigured(workspaceDir);
  const providers = await listPiProviders(workspaceDir);
  const settings = await loadPiSettings(workspaceDir);

  // Show current config
  console.log(
    formatPiConfigDisplay({
      provider: settings.defaultProvider,
      model: settings.defaultModel,
      apiKeys: providers,
    })
  );
  console.log('');

  // Ask to configure provider if not set
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
      console.log('   ⚠️  Invalid choice, skipping agent config\n');
      return;
    }

    // Ask for API key
    const existingKey = providers.find((p) => p.provider === provider);
    if (!existingKey?.hasKey) {
      console.log(`\n   Enter ${provider} API key:`);
      const link =
        provider === 'openai'
          ? 'https://platform.openai.com/api-keys'
          : provider === 'anthropic'
            ? 'https://console.anthropic.com/'
            : provider === 'google'
              ? 'https://ai.google.dev/'
              : 'https://openrouter.ai/keys';
      console.log(`   Get one at: ${link}`);
      console.log('');

      const apiKey = await prompt(`   ${provider.toUpperCase()}_API_KEY: `);
      if (apiKey) {
        const auth = await loadPiAuth(workspaceDir);
        auth[provider] = { apiKey };
        await savePiAuth(workspaceDir, auth);
        console.log(`   ✅ API key saved to ~/.vargos/agent/auth.json\n`);
      }
    }

    // Ask for model
    const defaultModels: Record<string, string> = {
      openai: 'gpt-4o',
      anthropic: 'claude-3-5-sonnet-20241022',
      google: 'gemini-1.5-pro',
      openrouter: 'openai/gpt-4o',
    };

    console.log(`\n   Enter model ID (default: ${defaultModels[provider]}):`);
    const modelInput = await prompt('   Model: ');
    const model = modelInput || defaultModels[provider];

    // Save settings
    await savePiSettings(workspaceDir, {
      ...settings,
      defaultProvider: provider,
      defaultModel: model,
    });

    console.log(`   ✅ Default model set: ${provider}/${model}\n`);
  } else if (!piStatus.hasApiKey) {
    // Provider set but no API key
    const provider = settings.defaultProvider;
    console.log(`\n   ${provider} API key is missing.`);
    console.log(`   Get one at: ${getProviderLink(provider)}`);
    console.log('');

    const apiKey = await prompt(`   ${provider.toUpperCase()}_API_KEY: `);
    if (apiKey) {
      const auth = await loadPiAuth(workspaceDir);
      auth[provider] = { apiKey };
      await savePiAuth(workspaceDir, auth);
      console.log(`   ✅ API key saved to ~/.vargos/agent/auth.json\n`);
    }
  } else {
    console.log('✅ Agent configuration complete\n');
  }
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

/**
 * Interactive configuration prompt
 */
export async function interactiveConfig(workspaceDir?: string): Promise<Record<string, string>> {
  const updates: Record<string, string> = {};
  const cwd = workspaceDir ?? process.cwd();

  console.log('');
  console.log('🔧 Vargos Configuration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const { missing, warnings } = checkConfig();

  if (warnings.length > 0) {
    console.log('ℹ️  Using defaults:');
    for (const warning of warnings) {
      console.log(`   • ${warning}`);
    }
    console.log('');
  }

  if (missing.length > 0) {
    console.log(`⚠️  ${missing.length} configuration value(s) needed:\n`);

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

      // Use default if empty
      if (!value && config.defaultValue) {
        value = config.defaultValue;
      }

      // Validate
      if (value && config.validate) {
        const valid = config.validate(value);
        if (typeof valid === 'string') {
          console.log(`   ⚠️  ${valid}`);
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

  // Configure Pi agent
  await interactivePiConfig(cwd);

  // Ask to save Vargos config to .env
  if (Object.keys(updates).length > 0) {
    const saveToEnv = await prompt('💾 Save Vargos config to .env file? (Y/n): ');
    if (saveToEnv.toLowerCase() !== 'n') {
      await saveEnvFile(updates);
      console.log('✅ Configuration saved to .env\n');
    }
  }

  return updates;
}

/**
 * Save configuration to .env file
 */
async function saveEnvFile(updates: Record<string, string>): Promise<void> {
  const envPath = path.join(process.cwd(), '.env');

  let content = '';
  try {
    content = await fs.readFile(envPath, 'utf-8');
  } catch {
    // File doesn't exist
  }

  const lines = content.split('\n');
  const existingKeys = new Set<string>();

  // Update existing lines
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

  // Add new entries
  for (const [key, value] of Object.entries(updates)) {
    if (!existingKeys.has(key)) {
      lines.push(`${key}=${value}`);
    }
  }

  await fs.writeFile(envPath, lines.join('\n'), 'utf-8');
}

/**
 * Print startup banner with configuration status
 */
export function printStartupBanner(options: {
  mode: 'mcp' | 'cli';
  version: string;
  workspace: string;
  memoryBackend: string;
  sessionsBackend: string;
  contextFiles: string[];
  toolsCount: number;
  transport?: string;
  port?: number;
  host?: string;
}): void {
  const lines = [
    '',
    options.mode === 'mcp' ? '🔧 Vargos MCP Server' : '🤖 Vargos CLI',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `Version: ${options.version}`,
    `Mode: ${options.mode}`,
    '',
    '📁 Configuration:',
    `  Workspace: ${options.workspace}`,
    `  Memory: ${options.memoryBackend}`,
    `  Sessions: ${options.sessionsBackend}`,
  ];

  if (options.transport) {
    lines.push(`  Transport: ${options.transport}`);
  }

  if (options.host && options.port) {
    lines.push(`  Listening: ${options.host}:${options.port}`);
  }

  lines.push(
    '',
    '📝 Context Files:',
    ...options.contextFiles.map((f) => `  ✓ ${f}`),
    '',
    `📡 ${options.mode === 'mcp' ? 'Server' : 'Agent'}:`,
    `  Tools: ${options.toolsCount} registered`,
    '',
    '✅ Ready',
    ''
  );

  console.error(lines.join('\n'));
}
