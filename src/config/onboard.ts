/**
 * First-run setup wizard — Identity → LLM → Channels
 * Uses @clack/prompts for consistent CLI experience
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { intro, outro, text, select, confirm, log, isCancel } from '@clack/prompts';
import pg from 'pg';
import { loadConfig, saveConfig, type ModelProfile, type StorageConfig, type VargosConfig } from './pi-config.js';
import { LOCAL_PROVIDERS } from './validate.js';

const PLACEHOLDERS = ['[Your name]', '[Preferred name]', '[they/them, he/him, she/her, etc.]', '[e.g., UTC, EST, PST]'];

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o', anthropic: 'claude-3-5-sonnet-20241022',
  google: 'gemini-1.5-pro', openrouter: 'openai/gpt-4o',
  ollama: 'llama3.2', lmstudio: 'default',
};

function getProviderLink(provider: string): string {
  const links: Record<string, string> = {
    openai: 'https://platform.openai.com/api-keys',
    anthropic: 'https://console.anthropic.com/',
    google: 'https://ai.google.dev/',
    openrouter: 'https://openrouter.ai/keys',
  };
  return links[provider] ?? '';
}

async function hasPlaceholderIdentity(workspaceDir: string): Promise<boolean> {
  try {
    const content = await fs.readFile(path.join(workspaceDir, 'USER.md'), 'utf-8');
    return PLACEHOLDERS.some((p) => content.includes(p));
  } catch {
    return false;
  }
}

// ── Step 1: Identity ──────────────────────────────────────────────────────────

async function setupIdentity(workspaceDir: string): Promise<void> {
  if (!(await hasPlaceholderIdentity(workspaceDir))) return;

  log.step('Identity');

  const name = await text({ message: 'Your name', placeholder: 'Jane Doe' });
  if (isCancel(name)) return;

  const preferred = await text({ message: 'What should the agent call you?', placeholder: name || 'Jane' });
  if (isCancel(preferred)) return;

  const pronouns = await text({ message: 'Pronouns', placeholder: 'he/him' });
  if (isCancel(pronouns)) return;

  const timezone = await text({ message: 'Timezone', placeholder: 'UTC' });
  if (isCancel(timezone)) return;

  const agentName = await text({ message: 'Agent name', placeholder: 'Vargos', defaultValue: 'Vargos' });
  if (isCancel(agentName)) return;

  const agentVibe = await text({ message: 'Agent vibe', placeholder: 'chill, professional' });
  if (isCancel(agentVibe)) return;

  // Patch USER.md
  const userPath = path.join(workspaceDir, 'USER.md');
  let userContent = await fs.readFile(userPath, 'utf-8');
  if (name) userContent = userContent.replace('[Your name]', name);
  if (preferred) userContent = userContent.replace('[Preferred name]', preferred);
  if (pronouns) userContent = userContent.replace('[they/them, he/him, she/her, etc.]', pronouns);
  if (timezone) userContent = userContent.replace('[e.g., UTC, EST, PST]', timezone);
  await fs.writeFile(userPath, userContent, 'utf-8');
  log.success('Updated USER.md');

  // Patch SOUL.md
  if (agentName || agentVibe) {
    const soulPath = path.join(workspaceDir, 'SOUL.md');
    try {
      let soulContent = await fs.readFile(soulPath, 'utf-8');
      const vibeLines: string[] = [];
      if (agentName) vibeLines.push(`Your name is ${agentName}.`);
      if (agentVibe) vibeLines.push(`Your vibe: ${agentVibe}.`);
      soulContent = soulContent.replace(/## Vibe\n\n/, `## Vibe\n\n${vibeLines.join('\n')}\n\n`);
      await fs.writeFile(soulPath, soulContent, 'utf-8');
      log.success('Updated SOUL.md');
    } catch { /* SOUL.md missing — skip */ }
  }
}

// ── Step 2: LLM config ───────────────────────────────────────────────────────

async function setupLlm(dataDir: string): Promise<void> {
  log.step('LLM Configuration');

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
  });
  if (isCancel(provider)) return;

  const model = await text({
    message: 'Model',
    defaultValue: DEFAULT_MODELS[provider],
    placeholder: DEFAULT_MODELS[provider],
  });
  if (isCancel(model)) return;

  const profile: ModelProfile = { provider, model };

  if (LOCAL_PROVIDERS.has(provider)) {
    const defaultUrl = provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234';
    const baseUrl = await text({
      message: 'Base URL',
      defaultValue: defaultUrl,
      placeholder: defaultUrl,
    });
    if (isCancel(baseUrl)) return;
    profile.baseUrl = baseUrl;
  } else {
    const link = getProviderLink(provider);
    const apiKey = await text({
      message: `API Key${link ? ` (get one at ${link})` : ''}`,
      placeholder: 'sk-...',
    });
    if (isCancel(apiKey)) return;
    if (apiKey) profile.apiKey = apiKey;
  }

  const profileName = provider;
  const existing = await loadConfig(dataDir);
  const models = existing?.models ?? {};
  models[profileName] = profile;
  const config: VargosConfig = existing
    ? { ...existing, models, agent: { ...existing.agent, primary: profileName } }
    : { models, agent: { primary: profileName } };
  await saveConfig(dataDir, config);
  log.success(`Configured ${provider}/${profile.model}`);
}

// ── Step 3: Storage ──────────────────────────────────────────────────────────

async function testPostgresConnection(url: string): Promise<string | null> {
  const dbName = new URL(url).pathname.slice(1);
  let pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query('SELECT 1');
  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr.code === '3D000') {
      // DB doesn't exist — try creating it
      await pool.end();
      const baseUrl = new URL(url);
      baseUrl.pathname = '/postgres';
      const bootstrap = new pg.Pool({ connectionString: baseUrl.toString() });
      try {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) return `Invalid database name: ${dbName}`;
        await bootstrap.query(`CREATE DATABASE ${dbName}`);
      } catch (createErr: unknown) {
        return (createErr as Error).message;
      } finally {
        await bootstrap.end();
      }
      // Reconnect to the newly created database
      pool = new pg.Pool({ connectionString: url });
    } else {
      return pgErr.message ?? 'Connection failed';
    }
  }

  // Verify pgvector extension is available
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '42501') {
      // Check if already installed by a superuser
      const { rows } = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'vector'");
      if (rows.length === 0) {
        await pool.end();
        return 'pgvector not installed — run as superuser: CREATE EXTENSION vector;';
      }
    } else {
      await pool.end();
      return `pgvector setup failed: ${(err as Error).message}`;
    }
  }

  await pool.end();
  return null;
}

export async function setupStorage(dataDir: string): Promise<void> {
  log.step('Storage');

  const storageType = await select({
    message: 'Storage backend',
    options: [
      { value: 'postgres', label: 'PostgreSQL (recommended)' },
      { value: 'sqlite', label: 'SQLite (local only)' },
    ],
  });
  if (isCancel(storageType)) return;

  const storage: StorageConfig = { type: storageType as 'postgres' | 'sqlite' };

  if (storageType === 'postgres') {
    let connected = false;
    while (!connected) {
      const url = await text({
        message: 'PostgreSQL URL',
        defaultValue: 'postgresql://localhost:5432/vargos',
        placeholder: 'postgresql://localhost:5432/vargos',
      });
      if (isCancel(url)) return;

      log.info('Testing connection...');
      const err = await testPostgresConnection(url);
      if (err) {
        log.error(`Connection failed: ${err}`);
        const fallback = await confirm({ message: 'Use SQLite instead?' });
        if (isCancel(fallback)) return;
        if (fallback) {
          storage.type = 'sqlite';
          connected = true;
        }
        // else: loop and retry
      } else {
        storage.url = url;
        connected = true;
        log.success('Connected to PostgreSQL');
      }
    }
  }

  const existing = await loadConfig(dataDir);
  if (existing) {
    existing.storage = storage;
    await saveConfig(dataDir, existing);
  }
}

// ── Step 4: Channels (optional) ──────────────────────────────────────────────

async function setupChannels(): Promise<void> {
  const wantChannel = await confirm({ message: 'Set up a messaging channel?' });
  if (isCancel(wantChannel) || !wantChannel) return;

  const channel = await select({
    message: 'Channel',
    options: [
      { value: 'whatsapp', label: 'WhatsApp (scan QR code)' },
      { value: 'telegram', label: 'Telegram (paste bot token)' },
    ],
  });
  if (isCancel(channel)) return;

  const { setupWhatsApp, setupTelegram } = await import('../channels/onboard.js');
  if (channel === 'whatsapp') await setupWhatsApp();
  else await setupTelegram();
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function runFirstRunSetup(dataDir: string, workspaceDir: string): Promise<void> {
  intro('Vargos — First Run Setup');

  await setupIdentity(workspaceDir);
  await setupLlm(dataDir);
  await setupStorage(dataDir);
  await setupChannels();

  outro('Setup complete — starting gateway...');
}
