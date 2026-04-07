import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitterBus } from '../../../../gateway/emitter.js';
import { ConfigService, normalizeConfigInput, AppConfigSchema, type AppConfig } from '../../index.js';

describe('ConfigService E2E', () => {
  let bus: EventEmitterBus;
  let service: ConfigService;
  let configPath: string;

  beforeEach(async () => {
    bus = new EventEmitterBus();

    const tempDir = path.join(os.tmpdir(), `config-test-${Date.now()}`);
    configPath = path.join(tempDir, 'config.json');

    const defaultConfig: AppConfig = {
      providers: {
        anthropic: {
          baseUrl: 'https://api.anthropic.com/v1',
          apiKey: 'sk-test',
          api: 'anthropic-messages',
          models: [
            { id: 'claude-opus-4-6', name: 'Claude Opus' },
          ],
        },
      },
      agent: {
        model: 'anthropic:claude-opus-4-6',
        subagents: {
          maxSpawnDepth: 3,
          runTimeoutSeconds: 300,
        },
      },
      channels: [],
      cron: { tasks: [] },
      webhooks: [],
      heartbeat: {},
      linkExpand: {},
      mcp: {},
      paths: {},
      gateway: { port: 9000 },
    };

    const dir = path.dirname(configPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));

    service = new ConfigService(bus, configPath);
    bus.bootstrap(service);
  });

  describe('config.get', () => {
    it('returns current config', async () => {
      const config = await bus.call('config.get', {});
      expect(config).toBeDefined();
      expect(config.providers).toBeDefined();
      expect(config.providers.anthropic).toBeDefined();
      expect(config.agent).toBeDefined();
      expect(config.gateway).toBeDefined();
    });

    it('config has required fields', async () => {
      const config = await bus.call('config.get', {});
      expect(config.gateway.port).toBeDefined();
      expect(typeof config.gateway.port).toBe('number');
    });
  });

  describe('config.set', () => {
    it('updates config fields', async () => {
      const before = await bus.call('config.get', {});
      const updated = await bus.call('config.set', {
        ...before,
        gateway: { ...before.gateway, port: 9999 },
      });
      expect(updated.gateway.port).toBe(9999);
    });

    it('merges partial updates', async () => {
      const before = await bus.call('config.get', {});
      const originalProviders = before.providers;
      const updated = await bus.call('config.set', {
        ...before,
        gateway: { ...before.gateway, port: 8888 },
      });
      expect(updated.providers).toEqual(originalProviders);
      expect(updated.gateway.port).toBe(8888);
    });

    it('broadcasts config.onChanged event', async () => {
      const before = await bus.call('config.get', {});
      let eventReceived = false;
      const unsubscribe = bus.on('config.onChanged', (config) => {
        expect(config).toBeDefined();
        eventReceived = true;
      });
      await bus.call('config.set', {
        ...before,
        gateway: { ...before.gateway, port: 7777 },
      });
      await new Promise(r => setTimeout(r, 10));
      expect(eventReceived).toBe(true);
      unsubscribe();
    });
  });
});

describe('normalizeConfigInput — v1 compat', () => {
  const V1_CONFIG = {
    providers: {
      openrouter: {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'sk-or-test',
        api: 'openai-completions',
        models: [
          { id: 'qwen/qwen3.5-35b-a3b', name: 'Qwen 3.5 35B', contextWindow: 262144, maxTokens: 32768 },
        ],
      },
      openai: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        api: 'openai-completions',
        models: [
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
        ],
      },
    },
    agent: {
      primary: 'openrouter:qwen/qwen3.5-35b-a3b',
      fallback: 'openai:gpt-4o-mini',
      media: { audio: 'openai:whisper-1', image: 'openai:gpt-4o-mini' },
    },
    channels: [
      { id: 'wa-1', type: 'whatsapp', enabled: true, allowFrom: ['+61400000000'] },
      { id: 'tg-1', type: 'telegram', enabled: false, botToken: 'tok:en', allowFrom: ['123'] },
    ],
    cron: {
      tasks: [
        { id: 'scan', name: 'Scan', schedule: '0 9 * * *', task: 'do stuff', enabled: true },
      ],
    },
    gateway: { host: '0.0.0.0', requestTimeout: 300 },
    mcp: { host: '0.0.0.0' },
    mcpServers: {
      atlassian: { command: 'uvx', args: ['mcp-atlassian'], env: { KEY: 'val' } },
      disabled: { command: 'npx', args: ['foo'], enabled: false },
    },
    storage: { type: 'postgres', url: 'postgresql://u:p@host/db' },
    heartbeat: {
      enabled: true,
      every: '*/30 * * * *',
      notify: [],
      activeHours: { start: '08:00', end: '22:00', timezone: 'Australia/Sydney' },
    },
  };

  it('normalizes agent.primary → agent.model', () => {
    const out = normalizeConfigInput(structuredClone(V1_CONFIG) as Record<string, unknown>);
    const agent = out.agent as Record<string, unknown>;
    expect(agent.model).toBe('openrouter:qwen/qwen3.5-35b-a3b');
    expect(agent).not.toHaveProperty('primary');
  });

  it('normalizes heartbeat.every → intervalMinutes and activeHours → tuple + timezone', () => {
    const out = normalizeConfigInput(structuredClone(V1_CONFIG) as Record<string, unknown>);
    const hb = out.heartbeat as Record<string, unknown>;
    expect(hb.intervalMinutes).toBe(30);
    expect(hb).not.toHaveProperty('every');
    expect(hb.activeHours).toEqual([8, 22]);
    expect(hb.activeHoursTimezone).toBe('Australia/Sydney');
  });

  it('full config passes AppConfigSchema validation', () => {
    const normalized = normalizeConfigInput(structuredClone(V1_CONFIG) as Record<string, unknown>);
    const result = AppConfigSchema.safeParse(normalized);
    if (!result.success) {
      const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(`Schema validation failed:\n${issues}`);
    }
    expect(Object.keys(result.data.providers)).toHaveLength(2);
    expect(result.data.providers.openrouter.models).toHaveLength(1);
    expect(result.data.agent.model).toBe('openrouter:qwen/qwen3.5-35b-a3b');
    expect(result.data.agent.fallback).toBe('openai:gpt-4o-mini');
    expect(result.data.channels).toHaveLength(2);
    expect(result.data.channels[0].enabled).toBe(true);
    expect(result.data.channels[1].enabled).toBe(false);
    expect(result.data.storage?.type).toBe('postgres');
    expect(result.data.storage?.url).toContain('postgresql://');
    expect(result.data.mcpServers).toBeDefined();
    expect(Object.keys(result.data.mcpServers!)).toHaveLength(2);
    expect(result.data.heartbeat.intervalMinutes).toBe(30);
    expect(result.data.heartbeat.activeHoursTimezone).toBe('Australia/Sydney');
    expect(result.data.gateway.requestTimeout).toBe(300);
  });

  it('preserves unknown top-level keys via passthrough', () => {
    const input = structuredClone(V1_CONFIG) as Record<string, unknown>;
    input.customField = 'kept';
    const normalized = normalizeConfigInput(input);
    const result = AppConfigSchema.safeParse(normalized);
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).customField).toBe('kept');
  });
});
