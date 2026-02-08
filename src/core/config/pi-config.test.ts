import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, saveConfig, syncPiSdkFiles, type VargosConfig } from './pi-config.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-config-test-'));
  await fs.mkdir(path.join(tmpDir, 'workspace', 'agent'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns null when config.json missing', async () => {
    expect(await loadConfig(tmpDir)).toBeNull();
  });

  it('loads valid nested config', async () => {
    const config: VargosConfig = { agent: { provider: 'openai', model: 'gpt-4o' } };
    await fs.writeFile(path.join(tmpDir, 'config.json'), JSON.stringify(config));

    const result = await loadConfig(tmpDir);
    expect(result).toEqual(config);
  });

  it('loads config with agent + channels', async () => {
    const config: VargosConfig = {
      agent: { provider: 'ollama', model: 'llama3', baseUrl: 'http://localhost:11434' },
      channels: {
        whatsapp: { enabled: true, allowFrom: ['+123'] },
        telegram: { enabled: true, botToken: '123:ABC' },
      },
    };
    await fs.writeFile(path.join(tmpDir, 'config.json'), JSON.stringify(config));

    const result = await loadConfig(tmpDir);
    expect(result).toEqual(config);
  });

  it('migrates flat workspace/config.json → nested format', async () => {
    const flat = { provider: 'anthropic', model: 'claude-3', apiKey: 'sk-ant' };
    await fs.writeFile(path.join(tmpDir, 'workspace', 'config.json'), JSON.stringify(flat));

    const result = await loadConfig(tmpDir);
    expect(result).toEqual({ agent: { provider: 'anthropic', model: 'claude-3', apiKey: 'sk-ant' } });

    // Original renamed to .bak
    const files = await fs.readdir(path.join(tmpDir, 'workspace'));
    expect(files).toContain('config.json.bak');

    // New config.json written to dataDir
    const written = JSON.parse(await fs.readFile(path.join(tmpDir, 'config.json'), 'utf-8'));
    expect(written.agent.provider).toBe('anthropic');
  });

  it('migrates legacy settings.json + auth.json', async () => {
    const settings = { defaultProvider: 'openai', defaultModel: 'gpt-4' };
    const auth = { openai: { apiKey: 'sk-test' } };
    await fs.writeFile(path.join(tmpDir, 'workspace', 'settings.json'), JSON.stringify(settings));
    await fs.writeFile(path.join(tmpDir, 'workspace', 'agent', 'auth.json'), JSON.stringify(auth));

    const result = await loadConfig(tmpDir);
    expect(result).toEqual({ agent: { provider: 'openai', model: 'gpt-4', apiKey: 'sk-test' } });

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
    expect(result?.agent.baseUrl).toBe('http://192.168.1.1:11434');
  });
});

describe('saveConfig', () => {
  it('writes config.json to data dir', async () => {
    const config: VargosConfig = { agent: { provider: 'google', model: 'gemini' } };
    await saveConfig(tmpDir, config);

    const written = JSON.parse(await fs.readFile(path.join(tmpDir, 'config.json'), 'utf-8'));
    expect(written).toEqual(config);
  });

  it('round-trips correctly', async () => {
    const config: VargosConfig = {
      agent: { provider: 'ollama', model: 'qwen3', baseUrl: 'http://localhost:11434' },
      channels: { whatsapp: { enabled: true } },
    };
    await saveConfig(tmpDir, config);
    const loaded = await loadConfig(tmpDir);
    expect(loaded).toEqual(config);
  });

  it('round-trips gateway, mcp, and paths sections', async () => {
    const config: VargosConfig = {
      agent: { provider: 'openai', model: 'gpt-4o' },
      gateway: { port: 9900, host: '0.0.0.0' },
      mcp: { transport: 'http', host: '0.0.0.0', port: 9901, endpoint: '/v1/mcp' },
      paths: { dataDir: '/tmp/vargos', workspace: '/tmp/vargos/ws' },
    };
    await saveConfig(tmpDir, config);
    const loaded = await loadConfig(tmpDir);
    expect(loaded).toEqual(config);
  });
});

describe('syncPiSdkFiles', () => {
  const wsDir = () => path.join(tmpDir, 'workspace');

  it('writes auth.json with provider-keyed apiKey', async () => {
    await syncPiSdkFiles(wsDir(), { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test' });

    const auth = JSON.parse(await fs.readFile(path.join(wsDir(), 'agent', 'auth.json'), 'utf-8'));
    expect(auth).toEqual({ openai: { apiKey: 'sk-test' } });
  });

  it('writes settings.json with provider and model', async () => {
    await syncPiSdkFiles(wsDir(), { provider: 'anthropic', model: 'claude-3' });

    const settings = JSON.parse(await fs.readFile(path.join(wsDir(), 'settings.json'), 'utf-8'));
    expect(settings.defaultProvider).toBe('anthropic');
    expect(settings.defaultModel).toBe('claude-3');
  });

  it('creates agent dir if missing', async () => {
    await fs.rm(path.join(wsDir(), 'agent'), { recursive: true });
    await syncPiSdkFiles(wsDir(), { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-x' });

    const stat = await fs.stat(path.join(wsDir(), 'agent'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('skips auth.json when no apiKey', async () => {
    await syncPiSdkFiles(wsDir(), { provider: 'ollama', model: 'llama3' });

    try {
      await fs.access(path.join(wsDir(), 'agent', 'auth.json'));
      expect.fail('auth.json should not exist');
    } catch {
      // expected
    }
  });

  it('writes dummy auth key for local providers without apiKey', async () => {
    await syncPiSdkFiles(wsDir(), {
      provider: 'ollama',
      model: 'llama3',
      baseUrl: 'http://192.168.1.1:11434',
    });

    const auth = JSON.parse(await fs.readFile(path.join(wsDir(), 'agent', 'auth.json'), 'utf-8'));
    expect(auth.ollama.apiKey).toBe('local');
  });
});
