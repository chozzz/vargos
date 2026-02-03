/**
 * Configuration validation
 */

export interface ConfigPrompt {
  key: string;
  required: boolean;
  defaultValue?: string;
  description: string;
  why: string;
  link?: string;
  validate?: (value: string) => boolean | string;
}

export const CONFIG_PROMPTS: ConfigPrompt[] = [
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

export function checkConfig(): {
  valid: boolean;
  missing: ConfigPrompt[];
  warnings: string[];
} {
  const memoryBackend = process.env.VARGOS_MEMORY_BACKEND ?? 'file';
  const sessionsBackend = process.env.VARGOS_SESSIONS_BACKEND ?? 'file';

  const missing: ConfigPrompt[] = [];
  const warnings: string[] = [];

  if (memoryBackend === 'qdrant' && !process.env.OPENAI_API_KEY) {
    missing.push(CONFIG_PROMPTS.find((p) => p.key === 'OPENAI_API_KEY')!);
  }

  if (memoryBackend === 'qdrant' && !process.env.QDRANT_URL) {
    missing.push(CONFIG_PROMPTS.find((p) => p.key === 'QDRANT_URL')!);
  }

  if (sessionsBackend === 'postgres' && !process.env.POSTGRES_URL) {
    missing.push(CONFIG_PROMPTS.find((p) => p.key === 'POSTGRES_URL')!);
  }

  if (!process.env.VARGOS_WORKSPACE) {
    warnings.push('VARGOS_WORKSPACE not set (default depends on entry: CLI = project or ~/.vargos/workspace, MCP = ~/.vargos/workspace)');
  }

  return { valid: missing.length === 0, missing, warnings };
}
