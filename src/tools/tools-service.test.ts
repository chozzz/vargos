import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { GatewayServer } from '../gateway/server.js';
import { ServiceClient } from '../gateway/service-client.js';
import { ToolsService } from './service.js';
import { ToolRegistry } from './registry.js';
import type { Tool, ToolResult } from './types.js';

const PORT = 19802;
const GATEWAY_URL = `ws://127.0.0.1:${PORT}`;

// Simple test tool
const greetTool: Tool = {
  name: 'greet',
  description: 'Says hello',
  parameters: z.object({ name: z.string() }),
  async execute(args: unknown) {
    const { name } = args as { name: string };
    return { content: [{ type: 'text' as const, text: `Hello, ${name}!` }] };
  },
};

const failTool: Tool = {
  name: 'fail',
  description: 'Always fails',
  parameters: z.object({}),
  async execute() {
    throw new Error('Tool broke');
  },
};

// Simple caller that makes RPC calls
class TestCaller extends ServiceClient {
  constructor() {
    super({
      service: 'test-caller',
      methods: [],
      events: [],
      subscriptions: [],
      gatewayUrl: GATEWAY_URL,
    });
  }
  async handleMethod(): Promise<unknown> { throw new Error('not implemented'); }
  handleEvent(): void {}
}

describe('ToolsService', () => {
  let gateway: GatewayServer;
  let tools: ToolsService;
  let caller: TestCaller;

  beforeEach(async () => {
    gateway = new GatewayServer({ port: PORT, host: '127.0.0.1', requestTimeout: 5000, pingInterval: 60_000 });
    await gateway.start();

    const registry = new ToolRegistry();
    registry.register(greetTool);
    registry.register(failTool);

    tools = new ToolsService({ registry, gatewayUrl: GATEWAY_URL });
    await tools.connect();

    caller = new TestCaller();
    await caller.connect();
  });

  afterEach(async () => {
    await caller.disconnect();
    await tools.disconnect();
    await gateway.stop();
  });

  it('lists tools via gateway', async () => {
    const result = await caller.call<Array<{ name: string }>>('tools', 'tool.list');
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.name).sort()).toEqual(['fail', 'greet']);
  });

  it('executes a tool via gateway', async () => {
    const result = await caller.call<ToolResult>('tools', 'tool.execute', {
      name: 'greet',
      args: { name: 'World' },
      context: { sessionKey: 'test', workingDir: '/tmp' },
    });
    expect(result.content[0]).toEqual({ type: 'text', text: 'Hello, World!' });
  });

  it('describes a tool via gateway', async () => {
    const result = await caller.call<{ name: string; description: string }>('tools', 'tool.describe', { name: 'greet' });
    expect(result.name).toBe('greet');
    expect(result.description).toBe('Says hello');
  });

  it('returns error for unknown tool', async () => {
    await expect(
      caller.call('tools', 'tool.execute', { name: 'nope', args: {} })
    ).rejects.toThrow('Unknown tool: nope');
  });

  it('propagates tool execution errors', async () => {
    await expect(
      caller.call('tools', 'tool.execute', { name: 'fail', args: {} })
    ).rejects.toThrow('Tool broke');
  });
});
