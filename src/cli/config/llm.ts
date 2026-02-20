import { select, text, isCancel } from '@clack/prompts';
import chalk from 'chalk';
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

  const profileNames = Object.keys(existing.models);

  const action = await select({
    message: 'What would you like to do?',
    options: [
      { value: 'switch', label: 'Switch active model' },
      { value: 'add', label: 'Add new model profile' },
      { value: 'edit', label: 'Edit existing profile' },
      { value: 'remove', label: 'Remove a profile' },
    ],
  });
  if (isCancel(action)) process.exit(0);

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

  const choice = await select({
    message: 'Select primary model',
    options: names.map((name) => {
      const p = config.models[name];
      const current = name === config.agent.primary ? ' (current)' : '';
      return { value: name, label: `${name} — ${p.provider}/${p.model}${current}` };
    }),
    initialValue: config.agent.primary,
  });
  if (isCancel(choice)) return;

  config.agent.primary = choice;
  await saveConfig(dataDir, config);
  const p = config.models[choice];
  console.log(chalk.green(`\n  Active model: ${choice} (${p.provider}/${p.model})\n`));
}

async function addProfile(config: VargosConfig, dataDir: string): Promise<void> {
  const profile = await promptProfile();
  if (!profile) return;

  const name = await text({
    message: 'Profile name',
    placeholder: profile.provider,
    defaultValue: profile.provider,
    validate: (v) => {
      if (!v?.trim()) return 'Name required';
      if (config.models[v!]) return `"${v}" already exists`;
    },
  });
  if (isCancel(name)) return;

  config.models[name] = profile;

  // If this is the only profile, auto-set as primary
  if (Object.keys(config.models).length === 1) {
    config.agent.primary = name;
  }

  await saveConfig(dataDir, config);
  console.log(chalk.green(`\n  Added profile "${name}" (${profile.provider}/${profile.model})\n`));
}

async function editProfile(config: VargosConfig, dataDir: string, names: string[]): Promise<void> {
  const name = await select({
    message: 'Which profile?',
    options: names.map((n) => {
      const p = config.models[n];
      return { value: n, label: `${n} — ${p.provider}/${p.model}` };
    }),
  });
  if (isCancel(name)) return;

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

  const name = await select({
    message: 'Which profile to remove?',
    options: names
      .filter((n) => n !== config.agent.primary)
      .map((n) => {
        const p = config.models[n];
        return { value: n, label: `${n} — ${p.provider}/${p.model}` };
      }),
  });
  if (isCancel(name)) return;

  delete config.models[name];
  if (config.agent.fallback === name) delete config.agent.fallback;
  await saveConfig(dataDir, config);
  console.log(chalk.green(`\n  Removed "${name}"\n`));
}

/** Shared profile prompt — pre-fills from existing profile if editing */
async function promptProfile(existing?: ModelProfile): Promise<ModelProfile | null> {
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
    initialValue: existing?.provider,
  });
  if (isCancel(provider)) return null;

  const model = await text({
    message: 'Model',
    defaultValue: existing?.provider === provider ? existing.model : DEFAULT_MODELS[provider],
    placeholder: DEFAULT_MODELS[provider],
  });
  if (isCancel(model)) return null;

  const profile: ModelProfile = { provider, model };

  if (LOCAL_PROVIDERS.has(provider)) {
    const defaultUrl = provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234';
    const baseUrl = await text({
      message: 'Base URL',
      defaultValue: existing?.baseUrl ?? defaultUrl,
      placeholder: defaultUrl,
    });
    if (isCancel(baseUrl)) return null;
    profile.baseUrl = baseUrl;
  } else {
    // Pre-fill from existing profile for same provider, or from existing if editing
    const currentKey = existing?.provider === provider ? existing.apiKey : undefined;
    const apiKey = await text({
      message: 'API Key',
      defaultValue: currentKey,
      placeholder: currentKey ? maskSecret(currentKey) : 'sk-...',
    });
    if (isCancel(apiKey)) return null;
    // Keep existing key if user pressed Enter without typing
    profile.apiKey = apiKey || currentKey;
  }

  return profile;
}
