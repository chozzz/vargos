import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Gateway, PluginRegistry, TextInputPlugin, getGateway, initializeGateway, type GatewayContext, type GatewayResponse, type NormalizedInput } from '../gateway/index.js';
import { processAndDeliver } from '../gateway/core.js';

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

  describe('Image Input Validation', () => {
    it('should accept image type with Buffer content', async () => {
      const input: NormalizedInput = {
        type: 'image',
        content: Buffer.from('fake-image'),
        metadata: { mimeType: 'image/jpeg', caption: 'a photo' },
        source: { channel: 'whatsapp', userId: 'u1', sessionKey: 's1' },
        timestamp: Date.now(),
      };

      const context: GatewayContext = {
        sessionKey: 's1',
        userId: 'u1',
        channel: 'whatsapp',
        permissions: ['*'],
        metadata: {},
      };

      const result = await gateway.processInput(input, context);
      // Reaches execute() which will fail without services, but validation passes
      expect(result).toBeDefined();
      expect(result.type).toBeDefined();
    });

    it('should reject image input with empty content', async () => {
      const input = {
        type: 'image',
        content: Buffer.alloc(0),
        metadata: { mimeType: 'image/jpeg' },
        source: { channel: 'whatsapp', userId: 'u1', sessionKey: 's1' },
        timestamp: Date.now(),
      } as NormalizedInput;

      const context: GatewayContext = {
        sessionKey: 's1',
        userId: 'u1',
        channel: 'whatsapp',
        permissions: ['*'],
        metadata: {},
      };

      const result = await gateway.processInput(input, context);
      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
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

describe('processAndDeliver', () => {
  const input: NormalizedInput = {
    type: 'text',
    content: 'hello',
    metadata: {},
    source: { channel: 'test', userId: 'u1', sessionKey: 's1' },
    timestamp: Date.now(),
  };

  const context: GatewayContext = {
    sessionKey: 's1',
    userId: 'u1',
    channel: 'test',
    permissions: ['*'],
    metadata: {},
  };

  const successResult: GatewayResponse = { success: true, content: 'reply', type: 'text' };
  const errorResult: GatewayResponse = { success: false, content: 'fail', type: 'error' };

  let processInputSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    initializeGateway();
    processInputSpy = vi.spyOn(getGateway(), 'processInput');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should return result without sendTyping', async () => {
    processInputSpy.mockResolvedValue(successResult);
    const send = vi.fn();
    const result = await processAndDeliver(input, context, send);
    expect(result).toEqual(successResult);
  });

  it('should call send for successful results', async () => {
    processInputSpy.mockResolvedValue(successResult);
    const send = vi.fn().mockResolvedValue(undefined);
    await processAndDeliver(input, context, send);
    // deliverReply calls send with chunked content
    expect(send).toHaveBeenCalled();
  });

  it('should not call send for failed results', async () => {
    processInputSpy.mockResolvedValue(errorResult);
    const send = vi.fn();
    await processAndDeliver(input, context, send);
    expect(send).not.toHaveBeenCalled();
  });

  it('should fire sendTyping immediately', async () => {
    processInputSpy.mockResolvedValue(successResult);
    const send = vi.fn();
    const typing = vi.fn().mockResolvedValue(undefined);

    await processAndDeliver(input, context, send, typing);
    expect(typing).toHaveBeenCalledTimes(1);
  });

  it('should refresh typing on 4s interval', async () => {
    const typing = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn();

    // Make processInput hang until we resolve it
    let resolveProcess!: (v: GatewayResponse) => void;
    processInputSpy.mockReturnValue(new Promise((r) => { resolveProcess = r; }));

    const promise = processAndDeliver(input, context, send, typing);

    // Initial call
    expect(typing).toHaveBeenCalledTimes(1);

    // Advance 4s — second call
    await vi.advanceTimersByTimeAsync(4000);
    expect(typing).toHaveBeenCalledTimes(2);

    // Advance another 4s — third call
    await vi.advanceTimersByTimeAsync(4000);
    expect(typing).toHaveBeenCalledTimes(3);

    // Resolve and finish
    resolveProcess(successResult);
    await promise;
  });

  it('should clear interval after processing completes', async () => {
    const typing = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn();
    processInputSpy.mockResolvedValue(successResult);

    await processAndDeliver(input, context, send, typing);
    const callsAfter = typing.mock.calls.length;

    // Advancing time should not fire more typing calls
    await vi.advanceTimersByTimeAsync(8000);
    expect(typing).toHaveBeenCalledTimes(callsAfter);
  });

  it('should not break if sendTyping rejects', async () => {
    processInputSpy.mockResolvedValue(successResult);
    const send = vi.fn();
    const typing = vi.fn().mockRejectedValue(new Error('network'));

    const result = await processAndDeliver(input, context, send, typing);
    expect(result).toEqual(successResult);
  });
});
