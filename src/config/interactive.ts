/**
 * Interactive configuration prompt utility
 */

import readline from 'node:readline';
import { promises as fs } from 'node:fs';
import path from 'node:path';

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
    missing.push(CONFIG_PROMPTS.find(p => p.key === 'OPENAI_API_KEY')!);
  }

  // Check Qdrant URL if using Qdrant
  if (memoryBackend === 'qdrant' && !process.env.QDRANT_URL) {
    const prompt = CONFIG_PROMPTS.find(p => p.key === 'QDRANT_URL')!;
    missing.push(prompt);
  }

  // Check Postgres URL if using Postgres
  if (sessionsBackend === 'postgres' && !process.env.POSTGRES_URL) {
    missing.push(CONFIG_PROMPTS.find(p => p.key === 'POSTGRES_URL')!);
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
 * Interactive configuration prompt
 */
export async function interactiveConfig(): Promise<Record<string, string>> {
  const updates: Record<string, string> = {};
  
  console.log('');
  console.log('🔧 Vargos Configuration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const { valid, missing, warnings } = checkConfig();

  if (valid && warnings.length === 0) {
    console.log('✅ All required configuration present');
    return updates;
  }

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

  // Ask to save to .env
  const saveToEnv = await prompt('💾 Save to .env file? (Y/n): ');
  if (saveToEnv.toLowerCase() !== 'n') {
    await saveEnvFile(updates);
    console.log('✅ Configuration saved to .env\n');
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

  lines.push(
    '',
    '📝 Context Files:',
    ...options.contextFiles.map(f => `  ✓ ${f}`),
    '',
    `📡 ${options.mode === 'mcp' ? 'Server' : 'Agent'}:`,
    `  Tools: ${options.toolsCount} registered`,
    '',
    '✅ Ready',
    ''
  );

  console.error(lines.join('\n'));
}
