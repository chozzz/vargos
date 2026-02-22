import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GatewayServer } from '../gateway/server.js';
import { ServiceClient, type ServiceClientConfig } from '../gateway/service-client.js';

// Mock the Pi runtime dependencies so we can test the service shell
vi.mock('./runtime.js', () => {
  class MockRuntime {
    async run(config: any) {
      return { success: true, response: `Executed: ${config.sessionKey}`, duration: 100 };
    }
    abortRun() { return true; }
    listActiveRuns() { return []; }
    onStream() {}
    offStream() {}
    onLifecycle() {}
  }
  return { PiAgentRuntime: MockRuntime };
});

function createMockRuntime() {
  return {
    run: async (config: any) => ({ success: true, response: `Executed: ${config.sessionKey}`, duration: 100 }),
    abortRun: () => true,
    listActiveRuns: () => [],
    onStream: () => {},
    offStream: () => {},
    onLifecycle: () => {},
  } as any;
}

vi.mock('../config/pi-config.js', () => ({
  loadConfig: async () => ({
    models: { test: { provider: 'test', model: 'test-model', apiKey: 'test-key' } },
    agent: { primary: 'test' },
  }),
  resolveModel: (config: any) => config.models[config.agent.primary],
  getPiConfigPaths: () => ({ agentDir: '/tmp', authPath: '/tmp/auth.json', modelsPath: '/tmp/models.json' }),
}));

vi.mock('../config/workspace.js', () => ({
  loadContextFiles: async () => [],
}));

vi.mock('../config/paths.js', () => ({
  resolveWorkspaceDir: () => '/tmp/workspace',
  resolveDataDir: () => '/tmp/data',
}));

import { AgentService } from './service.js';

const PORT = 19806;
const GATEWAY_URL = `ws://127.0.0.1:${PORT}`;

class TestCaller extends ServiceClient {
  events: Array<{ event: string; payload: unknown }> = [];

  constructor(subs: ServiceClientConfig['subscriptions'] = []) {
    super({
      service: 'test-caller',
      methods: [],
      events: [],
      subscriptions: subs,
      gatewayUrl: GATEWAY_URL,
    });
  }
  async handleMethod(): Promise<unknown> { throw new Error('not implemented'); }
  handleEvent(event: string, payload: unknown): void {
    this.events.push({ event, payload });
  }
}

/** Mock channel service that records channel.send calls */
class MockChannelService extends ServiceClient {
  sent: Array<{ channel: string; userId: string; text: string }> = [];

  constructor() {
    super({
      service: 'channel',
      methods: ['channel.send'],
      events: [],
      subscriptions: [],
      gatewayUrl: GATEWAY_URL,
    });
  }
  async handleMethod(_method: string, params: unknown): Promise<unknown> {
    this.sent.push(params as { channel: string; userId: string; text: string });
    return { delivered: true };
  }
  handleEvent(): void {}
}

describe('AgentService', () => {
  let gateway: GatewayServer;
  let agent: AgentService;
  let caller: TestCaller;

  beforeEach(async () => {
    gateway = new GatewayServer({ port: PORT, host: '127.0.0.1', requestTimeout: 5000, pingInterval: 60_000 });
    await gateway.start();

    agent = new AgentService({ gatewayUrl: GATEWAY_URL, workspaceDir: '/tmp/workspace', dataDir: '/tmp/data', runtime: createMockRuntime() });
    await agent.connect();

    caller = new TestCaller(['run.started', 'run.completed']);
    await caller.connect();
  });

  afterEach(async () => {
    await caller.disconnect();
    await agent.disconnect();
    await gateway.stop();
  });

  it('runs an agent task via gateway', async () => {
    const result = await caller.call<{ success: boolean; response: string }>('agent', 'agent.run', {
      sessionKey: 'test:run',
      task: 'say hello',
    });

    expect(result.success).toBe(true);
    expect(result.response).toContain('test:run');
  });

  it('emits run events', async () => {
    await caller.call('agent', 'agent.run', {
      sessionKey: 'test:events',
      task: 'hello',
    });

    await new Promise((r) => setTimeout(r, 100));

    const started = caller.events.find((e) => e.event === 'run.started');
    expect(started).toBeDefined();
    expect((started!.payload as any).sessionKey).toBe('test:events');

    const completed = caller.events.find((e) => e.event === 'run.completed');
    expect(completed).toBeDefined();
    expect((completed!.payload as any).success).toBe(true);
  });

  it('aborts a run', async () => {
    const result = await caller.call<{ aborted: boolean }>('agent', 'agent.abort', {
      runId: 'some-run-id',
    });

    expect(result.aborted).toBe(true);
  });

  it('returns agent status', async () => {
    const result = await caller.call<{ activeRuns: unknown[] }>('agent', 'agent.status', {});
    expect(result.activeRuns).toEqual([]);
  });

  it('sends error feedback to channel on failed run', async () => {
    // Disconnect default agent and reconnect with a failing runtime
    await agent.disconnect();

    const failRuntime = createMockRuntime();
    failRuntime.run = async () => ({ success: false, error: 'LLM timeout after 30s', duration: 30000 });

    agent = new AgentService({ gatewayUrl: GATEWAY_URL, workspaceDir: '/tmp/workspace', dataDir: '/tmp/data', runtime: failRuntime });
    await agent.connect();

    const channel = new MockChannelService();
    await channel.connect();

    try {
      // Emit message.received to trigger handleInboundMessage
      caller.emit('message.received', {
        channel: 'whatsapp',
        userId: '123',
        sessionKey: 'whatsapp:123',
        content: 'Hello',
      });

      // Wait for async processing
      await new Promise((r) => setTimeout(r, 500));

      expect(channel.sent.length).toBe(1);
      expect(channel.sent[0].channel).toBe('whatsapp');
      expect(channel.sent[0].userId).toBe('123');
      expect(channel.sent[0].text).toContain('Something went wrong');
      expect(channel.sent[0].text).toContain('LLM timeout');
    } finally {
      await channel.disconnect();
    }
  });
});
