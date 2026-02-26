import chalk from 'chalk';
import { pick, pickText } from '../pick.js';
import { resolveDataDir } from '../../config/paths.js';
import { loadConfig, saveConfig } from '../../config/pi-config.js';
import type { EmbeddingConfig } from '../../config/pi-config.js';
import { maskSecret } from '../../lib/mask.js';

const LABEL = chalk.gray;
const DIM = chalk.dim;
const BOLD = chalk.bold;

const DEFAULT_MODEL = 'text-embedding-3-small';

export async function show(): Promise<void> {
  const config = await loadConfig(resolveDataDir());

  console.log(`\n  ${BOLD('Embedding')}\n`);

  if (!config?.embedding) {
    console.log(`    ${LABEL('Status')}    ${chalk.yellow('not configured')}`);
    console.log(DIM('\n  Configure: vargos config embedding edit\n'));
    return;
  }

  const emb = config.embedding;
  console.log(`    ${LABEL('Provider')}  ${emb.provider}`);
  console.log(`    ${LABEL('Model')}     ${emb.model ?? DEFAULT_MODEL}`);
  if (emb.apiKey) console.log(`    ${LABEL('API Key')}   ${maskSecret(emb.apiKey)}`);
  console.log();
}

export async function edit(): Promise<void> {
  const dataDir = resolveDataDir();
  const config = await loadConfig(dataDir);
  if (!config) {
    console.log(chalk.yellow('\n  No config found. Run: vargos config\n'));
    return;
  }

  const existing = config.embedding;

  const provider = await pick('Embedding provider', [
    { value: 'openai', label: 'OpenAI' },
    { value: 'none', label: 'None (disable vector search)' },
  ], existing?.provider ?? 'openai');
  if (provider === null) return;

  if (provider === 'none') {
    delete config.embedding;
    await saveConfig(dataDir, config);
    console.log(chalk.green('\n  Embedding disabled.\n'));
    return;
  }

  const apiKey = await pickText('OpenAI API Key', {
    initial: existing?.apiKey,
    placeholder: existing?.apiKey ? maskSecret(existing.apiKey) : 'sk-...',
  });
  if (apiKey === null) return;

  const model = await pickText('Model', {
    initial: existing?.model ?? DEFAULT_MODEL,
    placeholder: DEFAULT_MODEL,
  });
  if (model === null) return;

  const updated: EmbeddingConfig = { provider: 'openai' };
  if (apiKey) updated.apiKey = apiKey;
  if (model && model !== DEFAULT_MODEL) updated.model = model;

  config.embedding = updated;
  await saveConfig(dataDir, config);

  console.log(chalk.green(`\n  Embedding: ${updated.provider} / ${model || DEFAULT_MODEL}`));
  console.log(DIM('  Restart gateway to apply changes.\n'));
}
