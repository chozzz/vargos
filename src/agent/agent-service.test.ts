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

let mockConfig: any = {
  models: { test: { provider: 'test', model: 'test-model', apiKey: 'test-key' } },
  agent: { primary: 'test' },
};

vi.mock('../config/pi-config.js', () => ({
  loadConfig: async () => mockConfig,
  resolveModel: (config: any, name?: string) => {
    const key = name ?? config.agent.primary;
    const profile = config.models[key];
    if (!profile) throw new Error(`Model profile "${key}" not found`);
    return profile;
  },
  getPiConfigPaths: () => ({ agentDir: '/tmp', authPath: '/tmp/auth.json', modelsPath: '/tmp/models.json' }),
}));

const mockTransformMedia = vi.fn();
vi.mock('../lib/media-transform.js', () => ({
  transformMedia: (...args: any[]) => mockTransformMedia(...args),
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
    mockConfig = {
      models: { test: { provider: 'test', model: 'test-model', apiKey: 'test-key' } },
      agent: { primary: 'test' },
    };
    mockTransformMedia.mockReset();

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

  it('sends error when non-image media has no transform model', async () => {
    const channel = new MockChannelService();
    await channel.connect();

    try {
      caller.emit('message.received', {
        channel: 'whatsapp',
        userId: '456',
        sessionKey: 'whatsapp:456',
        content: '[Voice message]',
        metadata: {
          media: { type: 'audio', data: 'base64data', mimeType: 'audio/ogg', path: '/tmp/audio.ogg' },
        },
      });

      await new Promise((r) => setTimeout(r, 500));

      expect(channel.sent.length).toBe(1);
      expect(channel.sent[0].text).toContain('audio processing requires a model');
      expect(channel.sent[0].text).toContain('agent.media.audio');
    } finally {
      await channel.disconnect();
    }
  });

  it('sends error when media transform fails', async () => {
    mockConfig = {
      models: {
        test: { provider: 'test', model: 'test-model', apiKey: 'test-key' },
        whisper: { provider: 'openai', model: 'whisper-1', apiKey: 'sk-test' },
      },
      agent: { primary: 'test', media: { audio: 'whisper' } },
    };
    mockTransformMedia.mockRejectedValueOnce(new Error('Whisper API 401: Unauthorized'));

    const channel = new MockChannelService();
    await channel.connect();

    try {
      caller.emit('message.received', {
        channel: 'whatsapp',
        userId: '789',
        sessionKey: 'whatsapp:789',
        content: '[Voice message]',
        metadata: {
          media: { type: 'audio', data: 'base64data', mimeType: 'audio/ogg', path: '/tmp/audio.ogg' },
        },
      });

      await new Promise((r) => setTimeout(r, 500));

      expect(channel.sent.length).toBe(1);
      expect(channel.sent[0].text).toContain('Failed to process audio');
      expect(channel.sent[0].text).toContain('Whisper API 401');
    } finally {
      await channel.disconnect();
    }
  });

  it('uses transcription as task when audio transform succeeds', async () => {
    mockConfig = {
      models: {
        test: { provider: 'test', model: 'test-model', apiKey: 'test-key' },
        whisper: { provider: 'openai', model: 'whisper-1', apiKey: 'sk-test' },
      },
      agent: { primary: 'test', media: { audio: 'whisper' } },
    };
    mockTransformMedia.mockResolvedValueOnce('What is the weather today?');

    // Runtime that captures the task it receives
    await agent.disconnect();
    let capturedTask: string | undefined;
    const spyRuntime = createMockRuntime();
    spyRuntime.run = async (config: any) => {
      capturedTask = config.task;
      return { success: true, response: 'It is sunny', duration: 100 };
    };
    agent = new AgentService({ gatewayUrl: GATEWAY_URL, workspaceDir: '/tmp/workspace', dataDir: '/tmp/data', runtime: spyRuntime });
    await agent.connect();

    const channel = new MockChannelService();
    await channel.connect();

    try {
      caller.emit('message.received', {
        channel: 'whatsapp',
        userId: '101',
        sessionKey: 'whatsapp:101',
        content: '[Voice message received]',
        metadata: {
          media: { type: 'audio', data: 'base64data', mimeType: 'audio/ogg', path: '/tmp/audio.ogg' },
        },
      });

      await new Promise((r) => setTimeout(r, 500));

      expect(mockTransformMedia).toHaveBeenCalledOnce();
      expect(capturedTask).toBe('What is the weather today?');
      expect(channel.sent.length).toBe(1);
      expect(channel.sent[0].text).toBe('It is sunny');
    } finally {
      await channel.disconnect();
    }
  });

  it('image without media config falls through to primary model', async () => {
    // No agent.media configured — images should pass through
    let capturedTask: string | undefined;
    await agent.disconnect();
    const spyRuntime = createMockRuntime();
    spyRuntime.run = async (config: any) => {
      capturedTask = config.task;
      return { success: true, response: 'I see a cat', duration: 100 };
    };
    agent = new AgentService({ gatewayUrl: GATEWAY_URL, workspaceDir: '/tmp/workspace', dataDir: '/tmp/data', runtime: spyRuntime });
    await agent.connect();

    const channel = new MockChannelService();
    await channel.connect();

    try {
      caller.emit('message.received', {
        channel: 'telegram',
        userId: '202',
        sessionKey: 'telegram:202',
        content: 'What is this?',
        metadata: {
          images: [{ data: 'base64img', mimeType: 'image/jpeg' }],
          media: { type: 'image', data: 'base64img', mimeType: 'image/jpeg', path: '/tmp/img.jpg' },
        },
      });

      await new Promise((r) => setTimeout(r, 500));

      // Transform should NOT be called since no media model configured
      expect(mockTransformMedia).not.toHaveBeenCalled();
      // Original content passed through
      expect(capturedTask).toBe('What is this?');
      expect(channel.sent.length).toBe(1);
      expect(channel.sent[0].text).toBe('I see a cat');
    } finally {
      await channel.disconnect();
    }
  });

  it('retries once on empty cron response then notifies', async () => {
    await agent.disconnect();

    let runCount = 0;
    const retryRuntime = createMockRuntime();
    retryRuntime.run = async () => {
      runCount++;
      // First call: thinking-only (empty response), second: real response
      if (runCount === 1) return { success: true, response: '', duration: 100 };
      return { success: true, response: 'Sprint suggestion: MP-12345', duration: 100 };
    };

    agent = new AgentService({ gatewayUrl: GATEWAY_URL, workspaceDir: '/tmp/workspace', dataDir: '/tmp/data', runtime: retryRuntime });
    await agent.connect();

    // Mock sessions service for session.create / session.addMessage
    const sessions = new (class extends ServiceClient {
      constructor() {
        super({ service: 'sessions', methods: ['session.create', 'session.addMessage', 'session.getMessages'], events: [], subscriptions: [], gatewayUrl: GATEWAY_URL });
      }
      async handleMethod() { return {}; }
      handleEvent() {}
    })();
    await sessions.connect();

    const channel = new MockChannelService();
    await channel.connect();

    try {
      caller.emit('cron.trigger', {
        taskId: 'daily-breville-sprint-picker',
        task: 'Find easiest sprint ticket',
        sessionKey: 'cron:daily-breville-sprint-picker:2026-03-08',
        notify: ['whatsapp:123'],
      });

      await new Promise((r) => setTimeout(r, 1000));

      expect(runCount).toBe(2);
      expect(channel.sent.length).toBe(1);
      expect(channel.sent[0].text).toBe('Sprint suggestion: MP-12345');
    } finally {
      await sessions.disconnect();
      await channel.disconnect();
    }
  });

  it('does not retry when cron response is successful', async () => {
    await agent.disconnect();

    let runCount = 0;
    const okRuntime = createMockRuntime();
    okRuntime.run = async () => {
      runCount++;
      return { success: true, response: 'All good', duration: 100 };
    };

    agent = new AgentService({ gatewayUrl: GATEWAY_URL, workspaceDir: '/tmp/workspace', dataDir: '/tmp/data', runtime: okRuntime });
    await agent.connect();

    const sessions = new (class extends ServiceClient {
      constructor() {
        super({ service: 'sessions', methods: ['session.create', 'session.addMessage', 'session.getMessages'], events: [], subscriptions: [], gatewayUrl: GATEWAY_URL });
      }
      async handleMethod() { return {}; }
      handleEvent() {}
    })();
    await sessions.connect();

    const channel = new MockChannelService();
    await channel.connect();

    try {
      caller.emit('cron.trigger', {
        taskId: 'test-cron',
        task: 'Do something',
        sessionKey: 'cron:test:2026-03-08',
        notify: ['whatsapp:456'],
      });

      await new Promise((r) => setTimeout(r, 1000));

      expect(runCount).toBe(1);
      expect(channel.sent.length).toBe(1);
      expect(channel.sent[0].text).toBe('All good');
    } finally {
      await sessions.disconnect();
      await channel.disconnect();
    }
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
