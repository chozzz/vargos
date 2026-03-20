/**
 * First-run setup wizard — Identity → LLM → Channels
 * Uses @clack/prompts for consistent CLI experience
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { intro, outro, text, select, confirm, log, isCancel } from '@clack/prompts';
import { loadConfig, saveConfig, type ModelProfile, type StorageConfig, type VargosConfig } from '../config/pi-config.js';
import { LOCAL_PROVIDERS } from '../config/validate.js';

const SOUL_PLACEHOLDERS = ['[Your name]', '[Preferred name]', '[they/them, he/him, she/her, etc.]', '[e.g., UTC, EST, PST]'];

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
    const content = await fs.readFile(path.join(workspaceDir, 'SOUL.md'), 'utf-8');
    return SOUL_PLACEHOLDERS.some((p) => content.includes(p));
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

  // Patch SOUL.md — identity, user info, and vibe all live here now
  const soulPath = path.join(workspaceDir, 'SOUL.md');
  try {
    let content = await fs.readFile(soulPath, 'utf-8');

    // User info placeholders (in "Your Human" section)
    if (name) content = content.replace('[Your name]', name);
    if (preferred) content = content.replace('[Preferred name]', preferred);
    if (pronouns) content = content.replace('[they/them, he/him, she/her, etc.]', pronouns);
    if (timezone) content = content.replace('[e.g., UTC, EST, PST]', timezone);

    // Agent identity (prepend to Vibe section)
    const vibeLines: string[] = [];
    if (agentName) vibeLines.push(`Your name is ${agentName}.`);
    if (agentVibe) vibeLines.push(`Your vibe: ${agentVibe}.`);
    if (vibeLines.length > 0) {
      content = content.replace(/## Vibe\n\n/, `## Vibe\n\n${vibeLines.join('\n')}\n\n`);
    }

    await fs.writeFile(soulPath, content, 'utf-8');
    log.success('Updated SOUL.md');
  } catch { /* SOUL.md missing — skip */ }
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

  // Quick credential test for cloud providers
  if (!LOCAL_PROVIDERS.has(provider) && profile.apiKey) {
    await testLlmCredentials(provider, profile);
  }
}

async function testLlmCredentials(provider: string, profile: ModelProfile): Promise<void> {
  log.info('Testing API key...');
  const urls: Record<string, string> = {
    openai: 'https://api.openai.com/v1/models',
    anthropic: 'https://api.anthropic.com/v1/messages',
    google: 'https://generativelanguage.googleapis.com/v1beta/models',
    openrouter: 'https://openrouter.ai/api/v1/models',
  };
  const url = urls[provider];
  if (!url) return;

  try {
    const headers: Record<string, string> = provider === 'anthropic'
      ? { 'x-api-key': profile.apiKey!, 'anthropic-version': '2023-06-01' }
      : { 'Authorization': `Bearer ${profile.apiKey}` };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (res.status === 401 || res.status === 403) {
      log.warn('API key rejected — double-check the key and try again.');
    } else {
      log.success('API key verified');
    }
  } catch {
    log.warn('Could not verify API key (network issue) — will retry at boot.');
  }
}

// ── Step 3: Storage ──────────────────────────────────────────────────────────

async function testPostgresConnection(url: string): Promise<string | null> {
  const pg = await import('pg');
  const Pool = pg.default.Pool;
  const dbName = new URL(url).pathname.slice(1);
  let pool = new Pool({ connectionString: url });
  try {
    await pool.query('SELECT 1');
  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr.code === '3D000') {
      // DB doesn't exist — try creating it
      await pool.end();
      const baseUrl = new URL(url);
      baseUrl.pathname = '/postgres';
      const bootstrap = new Pool({ connectionString: baseUrl.toString() });
      try {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) return `Invalid database name: ${dbName}`;
        await bootstrap.query(`CREATE DATABASE ${dbName}`);
      } catch (createErr: unknown) {
        return (createErr as Error).message;
      } finally {
        await bootstrap.end();
      }
      // Reconnect to the newly created database
      pool = new Pool({ connectionString: url });
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
      { value: 'sqlite', label: 'SQLite (default, zero setup)' },
      { value: 'postgres', label: 'PostgreSQL (pgvector, production)' },
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

  const { setupWhatsApp, setupTelegram } = await import('./onboard-channels.js');
  if (channel === 'whatsapp') await setupWhatsApp();
  else await setupTelegram();
}

// ── Step 5: Media (optional) ─────────────────────────────────────────────────

/** Reuse an existing OpenAI profile's API key, or prompt for one */
async function resolveOpenaiKey(config: VargosConfig, promptMsg: string): Promise<string | null> {
  const existing = Object.values(config.models).find(m => m.provider === 'openai' && m.apiKey);
  if (existing?.apiKey) return existing.apiKey;
  const apiKey = await text({ message: promptMsg, placeholder: 'sk-...' });
  if (isCancel(apiKey)) return null;
  return apiKey || null;
}

async function setupMedia(dataDir: string): Promise<void> {
  const wantMedia = await confirm({ message: 'Set up voice/image processing?' });
  if (isCancel(wantMedia) || !wantMedia) return;

  const config = await loadConfig(dataDir);
  if (!config) return;

  log.step('Media Processing');

  const wantAudio = await confirm({ message: 'Enable voice message transcription (Whisper)?' });
  if (isCancel(wantAudio)) return;

  if (wantAudio) {
    const key = await resolveOpenaiKey(config, 'OpenAI API key for Whisper');
    if (key === null) return;
    config.models['whisper'] = { provider: 'openai', model: 'whisper-1', apiKey: key };
    config.agent.media = { ...config.agent.media, audio: 'whisper' };
    log.success('Whisper transcription configured');
  }

  const wantImage = await confirm({ message: 'Enable image description?' });
  if (isCancel(wantImage)) return;

  if (wantImage) {
    const key = await resolveOpenaiKey(config, 'OpenAI API key for vision');
    if (key === null) return;
    config.models['vision'] = { provider: 'openai', model: 'gpt-4o-mini', apiKey: key };
    config.agent.media = { ...config.agent.media, image: 'vision' };
    log.success('Image description configured');
  }

  await saveConfig(dataDir, config);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function runFirstRunSetup(dataDir: string, workspaceDir: string): Promise<void> {
  intro('Vargos — First Run Setup');

  await setupIdentity(workspaceDir);
  await setupLlm(dataDir);
  await setupStorage(dataDir);
  await setupChannels();
  await setupMedia(dataDir);

  outro('Setup complete — starting gateway...');
}
