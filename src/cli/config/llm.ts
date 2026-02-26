import chalk from 'chalk';
import { pick, pickText } from '../pick.js';
import { loadAndValidate } from '../boot.js';
import { resolveDataDir } from '../../config/paths.js';
import { loadConfig, saveConfig, resolveModel, type ModelProfile, type VargosConfig } from '../../config/pi-config.js';
import { LOCAL_PROVIDERS } from '../../config/validate.js';
import { maskSecret } from '../../lib/mask.js';

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o', anthropic: 'claude-3-5-sonnet-20241022',
  google: 'gemini-1.5-pro', openrouter: 'openai/gpt-4o',
  ollama: 'llama3.2', lmstudio: 'default',
};

export async function show(): Promise<void> {
  const { config } = await loadAndValidate();

  console.log(`\n  ${chalk.bold('Model Profiles')}\n`);
  for (const [name, profile] of Object.entries(config.models)) {
    const active = name === config.agent.primary ? chalk.green(' ← primary') : '';
    const fallback = name === config.agent.fallback ? chalk.yellow(' ← fallback') : '';
    console.log(`    ${chalk.cyan(name)}${active}${fallback}`);
    console.log(`      ${chalk.gray('Provider')}  ${profile.provider}`);
    console.log(`      ${chalk.gray('Model')}     ${profile.model}`);
    if (profile.apiKey) console.log(`      ${chalk.gray('API Key')}   ${maskSecret(profile.apiKey)}`);
    if (profile.baseUrl) console.log(`      ${chalk.gray('Base URL')}  ${profile.baseUrl}`);
    console.log();
  }
}

export async function edit(): Promise<void> {
  const dataDir = resolveDataDir();
  const existing = await loadConfig(dataDir);
  if (!existing) {
    console.log(chalk.yellow('\n  No config found. Run: vargos config llm edit\n'));
    return;
  }

  const action = await pick('What would you like to do?', [
    { value: 'switch', label: 'Switch active model' },
    { value: 'add', label: 'Add new model profile' },
    { value: 'edit', label: 'Edit existing profile' },
    { value: 'remove', label: 'Remove a profile' },
  ]);
  if (action === null) return;

  const profileNames = Object.keys(existing.models);

  switch (action) {
    case 'switch': await switchActive(existing, dataDir); break;
    case 'add': await addProfile(existing, dataDir); break;
    case 'edit': await editProfile(existing, dataDir, profileNames); break;
    case 'remove': await removeProfile(existing, dataDir, profileNames); break;
  }
}

async function switchActive(config: VargosConfig, dataDir: string): Promise<void> {
  const names = Object.keys(config.models);
  if (names.length < 2) {
    console.log(chalk.yellow('\n  Only one profile exists. Add another first.\n'));
    return;
  }

  const choice = await pick('Select primary model', names.map((name) => {
    const p = config.models[name];
    const current = name === config.agent.primary ? ' (current)' : '';
    return { value: name, label: `${name} — ${p.provider}/${p.model}${current}` };
  }), config.agent.primary);
  if (choice === null) return;

  config.agent.primary = choice;
  await saveConfig(dataDir, config);
  const p = config.models[choice];
  console.log(chalk.green(`\n  Active model: ${choice} (${p.provider}/${p.model})\n`));
}

async function addProfile(config: VargosConfig, dataDir: string): Promise<void> {
  const profile = await promptProfile();
  if (!profile) return;

  const name = await pickText('Profile name', {
    placeholder: profile.provider,
    initial: profile.provider,
    validate: (v) => {
      if (!v?.trim()) return 'Name required';
      if (config.models[v!]) return `"${v}" already exists`;
    },
  });
  if (name === null) return;

  config.models[name] = profile;

  if (Object.keys(config.models).length === 1) {
    config.agent.primary = name;
  }

  await saveConfig(dataDir, config);
  console.log(chalk.green(`\n  Added profile "${name}" (${profile.provider}/${profile.model})\n`));
}

async function editProfile(config: VargosConfig, dataDir: string, names: string[]): Promise<void> {
  const name = await pick('Which profile?', names.map((n) => {
    const p = config.models[n];
    return { value: n, label: `${n} — ${p.provider}/${p.model}` };
  }));
  if (name === null) return;

  const existing = config.models[name];
  const profile = await promptProfile(existing);
  if (!profile) return;

  config.models[name] = profile;
  await saveConfig(dataDir, config);
  console.log(chalk.green(`\n  Updated "${name}" (${profile.provider}/${profile.model})\n`));
}

async function removeProfile(config: VargosConfig, dataDir: string, names: string[]): Promise<void> {
  if (names.length <= 1) {
    console.log(chalk.yellow('\n  Cannot remove the last profile.\n'));
    return;
  }

  const name = await pick('Which profile to remove?', names
    .filter((n) => n !== config.agent.primary)
    .map((n) => {
      const p = config.models[n];
      return { value: n, label: `${n} — ${p.provider}/${p.model}` };
    }));
  if (name === null) return;

  delete config.models[name];
  if (config.agent.fallback === name) delete config.agent.fallback;
  await saveConfig(dataDir, config);
  console.log(chalk.green(`\n  Removed "${name}"\n`));
}

async function promptProfile(existing?: ModelProfile): Promise<ModelProfile | null> {
  const provider = await pick('Provider', [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'google', label: 'Google' },
    { value: 'openrouter', label: 'OpenRouter' },
    { value: 'ollama', label: 'Ollama (local)' },
    { value: 'lmstudio', label: 'LM Studio (local)' },
  ], existing?.provider);
  if (provider === null) return null;

  const model = await pickText('Model', {
    initial: existing?.provider === provider ? existing.model : DEFAULT_MODELS[provider],
    placeholder: DEFAULT_MODELS[provider],
  });
  if (model === null) return null;

  const profile: ModelProfile = { provider, model };

  if (LOCAL_PROVIDERS.has(provider)) {
    const defaultUrl = provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234';
    const baseUrl = await pickText('Base URL', { initial: existing?.baseUrl ?? defaultUrl, placeholder: defaultUrl });
    if (baseUrl === null) return null;
    profile.baseUrl = baseUrl;
  } else {
    const currentKey = existing?.provider === provider ? existing.apiKey : undefined;
    const apiKey = await pickText('API Key', {
      initial: currentKey,
      placeholder: currentKey ? maskSecret(currentKey) : 'sk-...',
    });
    if (apiKey === null) return null;
    profile.apiKey = apiKey || currentKey;
  }

  return profile;
}
