/**
 * Interactive setup wizard for first-run LLM configuration.
 *
 * Writes directly to ~/.vargos/ following the same file layout that
 * services/config/index.ts reads: config.json, agent/models.json, agent/auth.json.
 *
 * Uses @clack/prompts (already a dependency) for the TUI.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { getDataPaths } from '../lib/paths.js';
import { registerChannel } from './channels.js';

// ── Provider presets ──────────────────────────────────────────────────────────

interface ProviderPreset {
  baseUrl: string;
  api: string; // Maps to Pi SDK API type (anthropic, openai-completions, google, etc.)
  models?: Array<{ id: string; name: string }>;
  envKey?: string; // Environment variable for API key
}

const PROVIDERS: Record<string, ProviderPreset> = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    api: 'anthropic',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    ],
    envKey: 'ANTHROPIC_API_KEY',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    api: 'openai-completions',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'o3', name: 'o3' },
    ],
    envKey: 'OPENAI_API_KEY',
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    api: 'openai-completions',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    ],
    envKey: 'GOOGLE_API_KEY',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    api: 'openai-completions',
    models: [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4 (OpenRouter)' },
      { id: 'openai/gpt-4o', name: 'GPT-4o (OpenRouter)' },
    ],
    envKey: 'OPENROUTER_API_KEY',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    api: 'openai-completions',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
    ],
    envKey: 'DEEPSEEK_API_KEY',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    api: 'openai-completions',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B' },
    ],
    envKey: 'GROQ_API_KEY',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    api: 'openai-completions',
    models: [{ id: 'llama3.2', name: 'Llama 3.2' }],
  },
};

// ── Write helpers ─────────────────────────────────────────────────────────────

function writeJson(filePath: string, data: unknown): void {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export async function onboard(): Promise<void> {
  const { dataDir, configFile } = getDataPaths();
  const agentDir = `${dataDir}/agent`;
  const hasConfig = existsSync(configFile);

  p.intro('⚡ Vargos — Setup Wizard');

  // ── Step 1: Provider (skip if already configured) ────────────────────────
  if (!hasConfig) {
    const providerKey = (await p.select({
      message: 'Choose your LLM provider:',
      options: Object.entries(PROVIDERS).map(([key, preset]) => {
        const local = key === 'ollama' ? ' (local)' : '';
        return { value: key, label: `${key}${local}`, hint: preset.baseUrl };
      }),
    })) as string | symbol;

    if (p.isCancel(providerKey)) {
      p.cancel('Setup cancelled. Run vargos onboard to try again.');
      process.exit(0);
    }

    const preset = PROVIDERS[providerKey];

    // ── Step 2: API Key ────────────────────────────────────────────────────
    let apiKey: string | undefined;

    if (preset.envKey) {
      const envVal = process.env[preset.envKey];
      if (envVal) {
        p.note(`Found ${preset.envKey} in environment — using it.`, 'API Key');
        apiKey = envVal;
      }
    }

    if (!apiKey && preset.envKey) {
      const input = (await p.password({
        message: `Enter your ${providerKey} API key:`,
        validate(value) {
          if (!value) return 'API key is required';
          return;
        },
      })) as string | symbol;

      if (p.isCancel(input)) {
        p.cancel('Setup cancelled.');
        process.exit(0);
      }
      apiKey = input;
    }

    // Local providers don't need an API key
    if (providerKey === 'ollama' && !apiKey) {
      apiKey = 'ollama';
    }

    // ── Step 3: Base URL (for custom/local) ────────────────────────────────
    let baseUrl = preset.baseUrl;

    if (providerKey === 'ollama') {
      const customUrl = (await p.text({
        message: `Ollama base URL:`,
        placeholder: preset.baseUrl,
        defaultValue: preset.baseUrl,
      })) as string | symbol;

      if (p.isCancel(customUrl)) {
        p.cancel('Setup cancelled.');
        process.exit(0);
      }
      baseUrl = customUrl || preset.baseUrl;
    }

    // ── Step 4: Model ──────────────────────────────────────────────────────
    let model = preset.models?.[0]?.id ?? '';

    if (preset.models && preset.models.length > 0) {
      const selected = (await p.select({
        message: 'Default model:',
        options: preset.models.map(m => ({ value: m.id, label: m.name })),
      })) as string | symbol;

      if (p.isCancel(selected)) {
        p.cancel('Setup cancelled.');
        process.exit(0);
      }
      model = selected;
    }

    if (!model && !preset.models) {
      const customModel = (await p.text({
        message: 'Enter model ID:',
        placeholder: 'e.g. gpt-4o, claude-sonnet-4-20250514',
      })) as string | symbol;

      if (p.isCancel(customModel)) {
        p.cancel('Setup cancelled.');
        process.exit(0);
      }
      model = customModel || '';
    }

    // ── Write config files ─────────────────────────────────────────────────

    const spinner = p.spinner();
    spinner.start('Writing configuration…');

    // config.json — minimal app config
    writeJson(configFile, { gateway: {} });

    // agent/models.json — provider registry
    writeJson(`${agentDir}/models.json`, {
      providers: {
        [providerKey]: {
          baseUrl,
          api: preset.api,
          ...(preset.models ? { models: preset.models } : {}),
        },
      },
    });

    // agent/auth.json — API key
    if (apiKey) {
      writeJson(`${agentDir}/auth.json`, {
        [providerKey]: { type: 'api_key', key: apiKey },
      });
    }

    // agent/settings.json — Pi SDK settings (default model + provider)
    writeJson(`${agentDir}/settings.json`, {
      defaultModel: model,
      defaultProvider: providerKey,
    });

    spinner.stop('Configuration saved.');
  }

  // ── Channels Setup ───────────────────────────────────────────────────────────

  p.note(
    'Vargos can connect to Telegram and WhatsApp so you can talk to your agent\n' +
    'from your phone. You can skip this and set up channels later.',
    'Communication',
  );

  const addChannel = (await p.confirm({
    message: 'Set up a messaging channel now?',
    initialValue: true,
  })) as boolean | symbol;

  if (!p.isCancel(addChannel) && addChannel) {
    const channelType = (await p.select({
      message: 'Which channel?',
      options: [
        { value: 'telegram', label: 'Telegram', hint: 'Bot API token required' },
        { value: 'whatsapp', label: 'WhatsApp', hint: 'QR code pairing' },
      ],
    })) as string | symbol;

    if (!p.isCancel(channelType)) {
      const channelId = (await p.text({
        message: 'Channel ID (a short name for this connection):',
        placeholder: channelType === 'telegram' ? 'telegram-bot' : 'whatsapp-personal',
        validate(value) {
          if (!value) return 'Channel ID is required';
          if (!/^[a-z0-9_-]+$/.test(value)) return 'Use lowercase letters, numbers, hyphens, underscores';
          return;
        },
      })) as string | symbol;

      if (!p.isCancel(channelId)) {
        try {
          if (channelType === 'telegram') {
            const tgBotKey = (await p.password({
              message: 'Telegram Bot Token (from @BotFather):',
              validate(value) {
                if (!value) return 'Bot token is required';
                return;
              },
            })) as string | symbol;

            if (!p.isCancel(tgBotKey)) {
              registerChannel({ id: channelId, type: 'telegram', botToken: tgBotKey });
              p.note(
                `Channel "${channelId}" registered.\nRun vargos start to bring it online.`,
                'Telegram',
              );
            }
          } else {
            // WhatsApp
            registerChannel({ id: channelId, type: 'whatsapp' });

            const pairNow = (await p.confirm({
              message: 'Pair WhatsApp now? (QR code will appear in terminal)',
              initialValue: true,
            })) as boolean | symbol;

            if (!p.isCancel(pairNow) && pairNow) {
              console.log('\n  Scan the QR code with WhatsApp → Linked Devices\n');
              try {
                const { pairWhatsApp } = await import('./channels.js');
                await pairWhatsApp(channelId);
              } catch (err) {
                p.note(
                  `Pairing failed: ${err instanceof Error ? err.message : err}\nRun "vargos channels pair whatsapp ${channelId}" to try again.`,
                  'WhatsApp',
                );
              }
            } else {
              p.note(
                `Channel "${channelId}" registered.\nRun "vargos channels pair whatsapp ${channelId}" to pair.`,
                'WhatsApp',
              );
            }
          }
        } catch (err) {
          p.note(
            `Failed: ${err instanceof Error ? err.message : err}`,
            'Error',
          );
        }
      }
    }
  }

  // ── MCP Adapter Setup ────────────────────────────────────────────────────────

  const enableMcp = (await p.confirm({
    message: 'Enable MCP (Model Context Protocol) support for accessing tools in chat?',
    initialValue: true,
  })) as boolean | symbol;

  if (!p.isCancel(enableMcp) && enableMcp) {
    const spinnerMcp = p.spinner();
    spinnerMcp.start('Setting up MCP adapter…');

    try {
      const { execSync } = await import('node:child_process');
      // Find pi CLI via node_modules (same logic as chat command)
      let piCliPath = 'pi';
      try {
        const searchDir = process.cwd();
        const piPath = path.join(
          searchDir,
          'node_modules',
          '@mariozechner',
          'pi-coding-agent',
          'dist',
          'cli.js',
        );
        if (existsSync(piPath)) piCliPath = piPath;
      } catch {
        // fallback to 'pi' command
      }

      execSync(`node "${piCliPath}" install npm:pi-mcp-adapter`, {
        stdio: 'pipe',
        env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
      });

      spinnerMcp.stop('MCP adapter installed.');
    } catch {
      spinnerMcp.stop('MCP setup skipped (pi CLI not available yet).');
      p.note(
        'You can enable MCP later by running: pi install npm:pi-mcp-adapter',
        'MCP Setup',
      );
    }
  }

  // ── Done ─────────────────────────────────────────────────────────────────

  if (!hasConfig) {
    p.note(
      [
        `Config:   ${configFile}`,
        `Models:   ${agentDir}/models.json`,
        `Auth:     ${agentDir}/auth.json`,
        `Settings: ${agentDir}/settings.json`,
      ].join('\n'),
      'Files written',
    );
  }

  p.outro('Ready. Run vargos start to boot the server.\n       Use vargos channels to manage messaging connections.');
}
