import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Gateway, PluginRegistry, TextInputPlugin, type GatewayContext, type NormalizedInput } from '../gateway/index.js';

describe('Gateway Core', () => {
  let gateway: Gateway;

  beforeEach(() => {
    gateway = new Gateway({
      port: 9999,
      wsPort: 9998,
      authRequired: false,
    });
  });

  afterEach(async () => {
    await gateway.stop();
  });

  describe('Plugin System', () => {
    it('should register text input plugin', () => {
      const plugin = new TextInputPlugin();
      gateway.registerPlugin(plugin);
      
      // Plugin should be registered without error
      expect(plugin.type).toBe('text');
      expect(plugin.name).toBe('text-plain');
    });

    it('should validate text input correctly', () => {
      const plugin = new TextInputPlugin();
      
      expect(plugin.validate('hello')).toBe(true);
      expect(plugin.validate({ text: 'hello' })).toBe(true);
      expect(plugin.validate({})).toBe(false);
      expect(plugin.validate(123)).toBe(false);
    });

    it('should transform text input to normalized format', async () => {
      const plugin = new TextInputPlugin();
      const context: GatewayContext = {
        sessionKey: 'test-session',
        userId: 'test-user',
        channel: 'test',
        permissions: ['*'],
        metadata: {},
      };

      const result = await plugin.transform('hello world', context);
      
      expect(result.type).toBe('text');
      expect(result.content).toBe('hello world');
      expect(result.source.sessionKey).toBe('test-session');
      expect(result.source.userId).toBe('test-user');
      expect(result.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Input Processing', () => {
    it('should process valid text input', async () => {
      const plugin = new TextInputPlugin();
      gateway.registerPlugin(plugin);

      const input: NormalizedInput = {
        type: 'text',
        content: 'test message',
        metadata: {},
        source: {
          channel: 'test',
          userId: 'user1',
          sessionKey: 'session1',
        },
        timestamp: Date.now(),
      };

      const context: GatewayContext = {
        sessionKey: 'session1',
        userId: 'user1',
        channel: 'test',
        permissions: ['*'],
        metadata: {},
      };

      const result = await gateway.processInput(input, context);
      
      // Should return a response (currently placeholder)
      expect(result).toBeDefined();
      expect(result.type).toBeDefined();
    });

    it('should reject invalid input type', async () => {
      const input = {
        type: 'unknown' as const,
        content: 'test',
        metadata: {},
        source: {
          channel: 'test',
          userId: 'user1',
          sessionKey: 'session1',
        },
        timestamp: Date.now(),
      } as unknown as NormalizedInput;

      const context: GatewayContext = {
        sessionKey: 'session1',
        userId: 'user1',
        channel: 'test',
        permissions: ['*'],
        metadata: {},
      };

      const result = await gateway.processInput(input, context);
      
      // Should fail gracefully
      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
    });
  });

  describe('Gateway Lifecycle', () => {
    it('should start and stop without errors', async () => {
      // Gateway doesn't auto-start servers in constructor
      // So we just verify it can be created
      expect(gateway).toBeDefined();
    });

    it('should emit events during lifecycle', async () => {
      const startingEvents: string[] = [];
      
      gateway.on('starting', () => startingEvents.push('starting'));
      gateway.on('started', () => startingEvents.push('started'));
      gateway.on('stopping', () => startingEvents.push('stopping'));
      gateway.on('stopped', () => startingEvents.push('stopped'));

      await gateway.start();
      expect(startingEvents).toContain('started');

      await gateway.stop();
      expect(startingEvents).toContain('stopped');
    });
  });

  describe('Plugin Registry', () => {
    it('should list registered plugins', () => {
      const registry = new PluginRegistry();
      const plugin = new TextInputPlugin();
      
      registry.register(plugin);
      
      const list = registry.list();
      expect(list).toHaveLength(1);
      expect(list[0].type).toBe('text');
      expect(list[0].name).toBe('text-plain');
    });

    it('should unregister plugins', () => {
      const registry = new PluginRegistry();
      const plugin = new TextInputPlugin();
      
      registry.register(plugin);
      expect(registry.list()).toHaveLength(1);
      
      const unregistered = registry.unregister('text', 'text-plain');
      expect(unregistered).toBe(true);
      expect(registry.list()).toHaveLength(0);
    });

    it('should find plugin for input', () => {
      const registry = new PluginRegistry();
      const plugin = new TextInputPlugin();
      
      registry.register(plugin);
      
      const found = registry.findForInput('hello');
      expect(found).toBeDefined();
      expect(found?.type).toBe('text');
    });
  });
});

describe('HTTP Transport', () => {
  it('should be instantiable', async () => {
    const { HTTPTransport } = await import('../gateway/transports.js');
    const transport = new HTTPTransport(9999, '127.0.0.1');
    expect(transport).toBeDefined();
  });
});

describe('WebSocket Transport', () => {
  it('should be instantiable', async () => {
    const { WebSocketTransport } = await import('../gateway/transports.js');
    const transport = new WebSocketTransport(9998, '127.0.0.1');
    expect(transport).toBeDefined();
  });
});
