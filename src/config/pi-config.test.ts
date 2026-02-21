import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, saveConfig, resolveModel, type VargosConfig } from './pi-config.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-config-test-'));
  await fs.mkdir(path.join(tmpDir, 'workspace', 'agent'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function validConfig(overrides?: Partial<VargosConfig>): VargosConfig {
  return {
    models: { openai: { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test' } },
    agent: { primary: 'openai' },
    ...overrides,
  };
}

describe('loadConfig', () => {
  it('returns null when config.json missing', async () => {
    expect(await loadConfig(tmpDir)).toBeNull();
  });

  it('loads valid config with models map', async () => {
    const config = validConfig();
    await fs.writeFile(path.join(tmpDir, 'config.json'), JSON.stringify(config));

    const result = await loadConfig(tmpDir);
    expect(result).toEqual(config);
  });

  it('loads config with models + channels', async () => {
    const config = validConfig({
      channels: {
        whatsapp: { enabled: true, allowFrom: ['+123'] },
        telegram: { enabled: true, botToken: '123:ABC' },
      },
    });
    await fs.writeFile(path.join(tmpDir, 'config.json'), JSON.stringify(config));

    const result = await loadConfig(tmpDir);
    expect(result).toEqual(config);
  });

  it('migrates inline agent format → models map', async () => {
    const legacy = { agent: { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-old' } };
    await fs.writeFile(path.join(tmpDir, 'config.json'), JSON.stringify(legacy));

    const result = await loadConfig(tmpDir);
    expect(result).toEqual({
      models: { openai: { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-old' } },
      agent: { primary: 'openai' },
    });

    // Persisted to disk
    const written = JSON.parse(await fs.readFile(path.join(tmpDir, 'config.json'), 'utf-8'));
    expect(written.models.openai.provider).toBe('openai');
    expect(written.agent.primary).toBe('openai');
  });

  it('migrates inline agent with channels preserved', async () => {
    const legacy = {
      agent: { provider: 'anthropic', model: 'claude-3', apiKey: 'sk-ant' },
      channels: { telegram: { enabled: true, botToken: '123:ABC' } },
    };
    await fs.writeFile(path.join(tmpDir, 'config.json'), JSON.stringify(legacy));

    const result = await loadConfig(tmpDir);
    expect(result?.models.anthropic.provider).toBe('anthropic');
    expect(result?.agent.primary).toBe('anthropic');
    expect(result?.channels?.telegram?.botToken).toBe('123:ABC');
  });

  it('migrates flat workspace/config.json → models map', async () => {
    const flat = { provider: 'anthropic', model: 'claude-3', apiKey: 'sk-ant' };
    await fs.writeFile(path.join(tmpDir, 'workspace', 'config.json'), JSON.stringify(flat));

    const result = await loadConfig(tmpDir);
    expect(result).toEqual({
      models: { anthropic: { provider: 'anthropic', model: 'claude-3', apiKey: 'sk-ant' } },
      agent: { primary: 'anthropic' },
    });

    // Original renamed to .bak
    const files = await fs.readdir(path.join(tmpDir, 'workspace'));
    expect(files).toContain('config.json.bak');

    // New config.json written to dataDir
    const written = JSON.parse(await fs.readFile(path.join(tmpDir, 'config.json'), 'utf-8'));
    expect(written.models.anthropic.provider).toBe('anthropic');
  });

  it('migrates legacy settings.json + auth.json → models map', async () => {
    const settings = { defaultProvider: 'openai', defaultModel: 'gpt-4' };
    const auth = { openai: { apiKey: 'sk-test' } };
    await fs.writeFile(path.join(tmpDir, 'workspace', 'settings.json'), JSON.stringify(settings));
    await fs.writeFile(path.join(tmpDir, 'workspace', 'agent', 'auth.json'), JSON.stringify(auth));

    const result = await loadConfig(tmpDir);
    expect(result).toEqual({
      models: { openai: { provider: 'openai', model: 'gpt-4', apiKey: 'sk-test' } },
      agent: { primary: 'openai' },
    });

    // Legacy files renamed
    const wsFiles = await fs.readdir(path.join(tmpDir, 'workspace'));
    expect(wsFiles).toContain('settings.json.bak');
  });

  it('migrates channels.json into channels section', async () => {
    const flat = { provider: 'openai', model: 'gpt-4o' };
    await fs.writeFile(path.join(tmpDir, 'workspace', 'config.json'), JSON.stringify(flat));

    const channels = { channels: [{ type: 'telegram', enabled: true, botToken: '123:ABC' }] };
    await fs.writeFile(path.join(tmpDir, 'channels.json'), JSON.stringify(channels));

    const result = await loadConfig(tmpDir);
    expect(result?.channels?.telegram).toEqual({ enabled: true, botToken: '123:ABC' });

    // channels.json renamed
    const files = await fs.readdir(tmpDir);
    expect(files).toContain('channels.json.bak');
  });

  it('migrates flat config with baseUrl', async () => {
    const flat = { provider: 'ollama', model: 'llama3', baseUrl: 'http://192.168.1.1:11434' };
    await fs.writeFile(path.join(tmpDir, 'workspace', 'config.json'), JSON.stringify(flat));

    const result = await loadConfig(tmpDir);
    expect(result?.models.ollama.baseUrl).toBe('http://192.168.1.1:11434');
  });
});

describe('saveConfig', () => {
  it('writes config.json to data dir', async () => {
    const config = validConfig({ models: { google: { provider: 'google', model: 'gemini' } }, agent: { primary: 'google' } });
    await saveConfig(tmpDir, config);

    const written = JSON.parse(await fs.readFile(path.join(tmpDir, 'config.json'), 'utf-8'));
    expect(written).toEqual(config);
  });

  it('round-trips correctly', async () => {
    const config = validConfig({
      models: { ollama: { provider: 'ollama', model: 'qwen3', baseUrl: 'http://localhost:11434' } },
      agent: { primary: 'ollama' },
      channels: { whatsapp: { enabled: true } },
    });
    await saveConfig(tmpDir, config);
    const loaded = await loadConfig(tmpDir);
    expect(loaded).toEqual(config);
  });

  it('round-trips gateway, mcp, and paths sections', async () => {
    const config = validConfig({
      gateway: { port: 9900, host: '0.0.0.0' },
      mcp: { transport: 'http', host: '0.0.0.0', port: 9901, endpoint: '/v1/mcp' },
      paths: { dataDir: '/tmp/vargos', workspace: '/tmp/vargos/ws' },
    });
    await saveConfig(tmpDir, config);
    const loaded = await loadConfig(tmpDir);
    expect(loaded).toEqual(config);
  });
});

describe('resolveModel', () => {
  it('resolves primary profile by default', () => {
    const config = validConfig();
    const profile = resolveModel(config);
    expect(profile.provider).toBe('openai');
    expect(profile.model).toBe('gpt-4o');
  });

  it('resolves named profile', () => {
    const config = validConfig({
      models: {
        openai: { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-1' },
        local: { provider: 'ollama', model: 'llama3' },
      },
    });
    const profile = resolveModel(config, 'local');
    expect(profile.provider).toBe('ollama');
    expect(profile.model).toBe('llama3');
  });

  it('throws for unknown profile', () => {
    const config = validConfig();
    expect(() => resolveModel(config, 'missing')).toThrow(/not found/);
  });
});
