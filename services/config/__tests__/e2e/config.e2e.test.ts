import { describe, it, expect, beforeEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitterBus } from '../../../../gateway/emitter.js';
import { ConfigService, type AppConfig } from '../../index.js';

vi.mock('../../../../lib/paths.js');

describe('ConfigService E2E', () => {
  let bus: EventEmitterBus;
  let service: ConfigService;
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    bus = new EventEmitterBus();

    tempDir = path.join(os.tmpdir(), `config-test-${Date.now()}-${Math.random()}`);
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

    mkdirSync(tempDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));

    // Mock getDataPaths to return our temp directory paths
    const { getDataPaths } = await import('../../../../lib/paths.js');
    vi.mocked(getDataPaths).mockReturnValue({
      configFile: configPath,
      dataDir: tempDir,
      workspaceDir: path.join(tempDir, 'workspace'),
    });

    service = new ConfigService(bus);
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

  });

  describe('three-file consolidation (config.json + agent/models.json + agent/settings.json)', () => {
    // Helper to mock getDataPaths for a given temp directory
    async function setupTestWithTempDir(tempDir2: string) {
      const configPath2 = path.join(tempDir2, 'config.json');
      const { getDataPaths } = await import('../../../../lib/paths.js');
      vi.mocked(getDataPaths).mockReturnValue({
        configFile: configPath2,
        dataDir: tempDir2,
        workspaceDir: path.join(tempDir2, 'workspace'),
      });
      return { configPath: configPath2, agentDir: path.join(tempDir2, 'agent') };
    }

    it('merges providers from agent/models.json into config.get', async () => {
      const tempDir2 = path.join(os.tmpdir(), `config-test-merge-${Date.now()}-${Math.random()}`);
      const { configPath: configPath2, agentDir: agentDir2 } = await setupTestWithTempDir(tempDir2);

      const config: AppConfig = {
        agent: { model: 'test:model' },
        channels: [],
        cron: { tasks: [] },
        webhooks: [],
        heartbeat: {},
        linkExpand: {},
        mcp: {},
        paths: {},
        gateway: { port: 9000 },
      };

      mkdirSync(tempDir2, { recursive: true });
      writeFileSync(configPath2, JSON.stringify(config, null, 2));

      mkdirSync(agentDir2, { recursive: true });
      const modelsPath = path.join(agentDir2, 'models.json');
      writeFileSync(modelsPath, JSON.stringify({
        providers: {
          openai: {
            baseUrl: 'https://api.openai.com/v1',
            apiKey: 'sk-test-openai',
          },
        },
      }, null, 2));

      const bus2 = new EventEmitterBus();
      const service2 = new ConfigService(bus2);
      bus2.bootstrap(service2);

      const result = await bus2.call('config.get', {});
      expect(result.providers).toBeDefined();
      expect(result.providers.openai).toBeDefined();
      expect(result.providers.openai.apiKey).toBe('sk-test-openai');
    });

    it('routes providers to agent/models.json on config.set', async () => {
      const tempDir2 = path.join(os.tmpdir(), `config-test-route-${Date.now()}-${Math.random()}`);
      const { configPath: configPath2, agentDir: agentDir2 } = await setupTestWithTempDir(tempDir2);

      const config: AppConfig = {
        agent: { model: 'test:model' },
        channels: [],
        cron: { tasks: [] },
        webhooks: [],
        heartbeat: {},
        linkExpand: {},
        mcp: {},
        paths: {},
        gateway: { port: 9000 },
      };

      mkdirSync(tempDir2, { recursive: true });
      writeFileSync(configPath2, JSON.stringify(config, null, 2));

      const bus2 = new EventEmitterBus();
      const service2 = new ConfigService(bus2);
      bus2.bootstrap(service2);

      await bus2.call('config.set', {
        ...config,
        providers: {
          custom: {
            baseUrl: 'https://custom.api/v1',
            apiKey: 'sk-custom',
          },
        },
      });

      const modelsPath = path.join(agentDir2, 'models.json');
      expect(existsSync(modelsPath)).toBe(true);
      const modelsContent = JSON.parse(readFileSync(modelsPath, 'utf-8'));
      expect(modelsContent.providers).toBeDefined();
      expect(modelsContent.providers.custom).toBeDefined();
    });

    it('creates agent/ directory if it does not exist', async () => {
      const tempDir2 = path.join(os.tmpdir(), `config-test-create-dir-${Date.now()}-${Math.random()}`);
      const { configPath: configPath2, agentDir: agentDir2 } = await setupTestWithTempDir(tempDir2);

      const config: AppConfig = {
        agent: { model: 'test:model' },
        channels: [],
        cron: { tasks: [] },
        webhooks: [],
        heartbeat: {},
        linkExpand: {},
        mcp: {},
        paths: {},
        gateway: { port: 9000 },
      };

      mkdirSync(tempDir2, { recursive: true });
      writeFileSync(configPath2, JSON.stringify(config, null, 2));

      const bus2 = new EventEmitterBus();
      const service2 = new ConfigService(bus2);
      bus2.bootstrap(service2);

      await bus2.call('config.set', {
        ...config,
        providers: {
          test: { baseUrl: 'https://test.api', apiKey: 'sk-test' },
        },
      });

      expect(existsSync(agentDir2)).toBe(true);
      expect(existsSync(path.join(agentDir2, 'models.json'))).toBe(true);
    });

    it('preserves non-provider fields in agent/models.json when updating', async () => {
      const tempDir2 = path.join(os.tmpdir(), `config-test-preserve-${Date.now()}-${Math.random()}`);
      const { configPath: configPath2, agentDir: agentDir2 } = await setupTestWithTempDir(tempDir2);

      const config: AppConfig = {
        agent: { model: 'test:model' },
        channels: [],
        cron: { tasks: [] },
        webhooks: [],
        heartbeat: {},
        linkExpand: {},
        mcp: {},
        paths: {},
        gateway: { port: 9000 },
      };

      mkdirSync(tempDir2, { recursive: true });
      writeFileSync(configPath2, JSON.stringify(config, null, 2));

      mkdirSync(agentDir2, { recursive: true });
      const modelsPath = path.join(agentDir2, 'models.json');
      writeFileSync(modelsPath, JSON.stringify({
        custom_field: 'should_be_preserved',
        providers: { existing: { baseUrl: 'https://test.api', apiKey: 'sk-existing' } },
      }, null, 2));

      const bus2 = new EventEmitterBus();
      const service2 = new ConfigService(bus2);
      bus2.bootstrap(service2);

      await bus2.call('config.set', {
        ...config,
        providers: { new_provider: { baseUrl: 'https://new.api', apiKey: 'sk-new' } },
      });

      const modelsContent = JSON.parse(readFileSync(modelsPath, 'utf-8'));
      expect(modelsContent.custom_field).toBe('should_be_preserved');
      expect(modelsContent.providers).toBeDefined();
      expect(Object.keys(modelsContent.providers).length).toBeGreaterThan(0);
    });

    it('merges agent/settings.json into config.get', async () => {
      const tempDir2 = path.join(os.tmpdir(), `config-test-settings-${Date.now()}-${Math.random()}`);
      const { configPath: configPath2, agentDir: agentDir2 } = await setupTestWithTempDir(tempDir2);

      const config: AppConfig = {
        agent: { model: 'test:model' },
        channels: [],
        cron: { tasks: [] },
        webhooks: [],
        heartbeat: {},
        linkExpand: {},
        mcp: {},
        paths: {},
        gateway: { port: 9000 },
      };

      mkdirSync(tempDir2, { recursive: true });
      writeFileSync(configPath2, JSON.stringify(config, null, 2));

      mkdirSync(agentDir2, { recursive: true });
      const settingsPath = path.join(agentDir2, 'settings.json');
      writeFileSync(settingsPath, JSON.stringify({
        customAgentSetting: 'from_pi_agent',
      }, null, 2));

      const bus2 = new EventEmitterBus();
      const service2 = new ConfigService(bus2);
      bus2.bootstrap(service2);

      const result = await bus2.call('config.get', {});
      expect((result.agent as Record<string, unknown>).customAgentSetting).toBe('from_pi_agent');
    });

    it('agent/settings.json takes precedence as source of truth', async () => {
      const tempDir2 = path.join(os.tmpdir(), `config-test-precedence-${Date.now()}-${Math.random()}`);
      const { configPath: configPath2, agentDir: agentDir2 } = await setupTestWithTempDir(tempDir2);

      const config: AppConfig = {
        agent: { model: 'anthropic:from-config-json' },
        channels: [],
        cron: { tasks: [] },
        webhooks: [],
        heartbeat: {},
        linkExpand: {},
        mcp: {},
        paths: {},
        gateway: { port: 9000 },
      };

      mkdirSync(tempDir2, { recursive: true });
      writeFileSync(configPath2, JSON.stringify(config, null, 2));

      mkdirSync(agentDir2, { recursive: true });
      const settingsPath = path.join(agentDir2, 'settings.json');
      writeFileSync(settingsPath, JSON.stringify({
        model: 'anthropic:from-settings',
      }, null, 2));

      const bus2 = new EventEmitterBus();
      const service2 = new ConfigService(bus2);
      bus2.bootstrap(service2);

      const result = await bus2.call('config.get', {});
      expect(result.agent.model).toBe('anthropic:from-settings');
    });
  });
});
