import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GatewayServer } from '../../gateway/server.js';
import { ServiceClient } from '../client.js';

// Mock the Pi runtime dependencies so we can test the service shell
vi.mock('../../core/runtime/runtime.js', () => {
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
  return {
    PiAgentRuntime: MockRuntime,
    getPiAgentRuntime: () => new MockRuntime(),
    initializePiAgentRuntime: () => new MockRuntime(),
  };
});

vi.mock('../../core/config/pi-config.js', () => ({
  loadConfig: async () => ({
    agent: { provider: 'test', model: 'test-model', apiKey: 'test-key' },
  }),
  getPiConfigPaths: () => ({ agentDir: '/tmp', authPath: '/tmp/auth.json', modelsPath: '/tmp/models.json' }),
}));

vi.mock('../../core/config/workspace.js', () => ({
  loadContextFiles: async () => [],
}));

vi.mock('../../core/config/paths.js', () => ({
  resolveSessionFile: (key: string) => `/tmp/sessions/${key}.jsonl`,
  resolveWorkspaceDir: () => '/tmp/workspace',
  resolveDataDir: () => '/tmp/data',
}));

import { AgentService } from './index.js';

const PORT = 19806;
const GATEWAY_URL = `ws://127.0.0.1:${PORT}`;

class TestCaller extends ServiceClient {
  events: Array<{ event: string; payload: unknown }> = [];

  constructor(subs: string[] = []) {
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

describe('AgentService', () => {
  let gateway: GatewayServer;
  let agent: AgentService;
  let caller: TestCaller;

  beforeEach(async () => {
    gateway = new GatewayServer({ port: PORT, host: '127.0.0.1', requestTimeout: 5000, pingInterval: 60_000 });
    await gateway.start();

    agent = new AgentService({ gatewayUrl: GATEWAY_URL, workspaceDir: '/tmp/workspace', dataDir: '/tmp/data' });
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
});
