import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitterBus } from '../../../../gateway/emitter.js';
import { ConfigService, type AppConfig } from '../../index.js';

describe('ConfigService E2E', () => {
  let bus: EventEmitterBus;
  let service: ConfigService;
  let configPath: string;

  beforeEach(async () => {
    bus = new EventEmitterBus();

    // Create a temporary config file
    const tempDir = path.join(os.tmpdir(), `config-test-${Date.now()}`);
    configPath = path.join(tempDir, 'config.json');

    const defaultConfig: AppConfig = {
      models: [
        {
          name: 'default',
          provider: 'anthropic',
          model: 'claude-opus-4-6',
          maxRetries: 3,
        },
      ],
      agent: {
        model: 'default',
        thinkingLevel: 'high',
        maxRetryDelayMs: 30000,
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
      gateway: {
        port: 9000,
      },
    };

    // Ensure directory exists and write config
    const dir = path.dirname(configPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));

    service = new ConfigService(bus, configPath);
    bus.registerService(service);
  });

  describe('config.get', () => {
    it('returns current config', async () => {
      const config = await bus.call('config.get', {});

      expect(config).toBeDefined();
      expect(config.models).toBeDefined();
      expect(Array.isArray(config.models)).toBe(true);
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
      const originalModels = before.models;

      const updated = await bus.call('config.set', {
        ...before,
        gateway: { ...before.gateway, port: 8888 },
      });

      // Models should remain unchanged
      expect(updated.models).toEqual(originalModels);
      // Port should be updated
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

      // Give event time to emit
      await new Promise(r => setTimeout(r, 10));

      expect(eventReceived).toBe(true);
      unsubscribe();
    });
  });
});
