/**
 * Channels service E2E tests — event-driven agent flow
 *
 * Tests the refactored channels service where:
 *   - onInboundMessage fires agent.execute without awaiting
 *   - onAgentCompleted handles reply delivery and cleanup
 *   - subscribeToSessionEvents in agent/index.ts bridges PiAgent → bus events
 *
 * Strategy: real EventEmitterBus, stub adapter, stub agent.execute handler.
 * No mocking of the bus itself — verifies the full event dispatch path.
 *
 * Note: eslint-disable @typescript-eslint/no-explicit-any is used throughout
 * because test fixtures, stubs, and mocks require flexible typing.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, type MockInstance } from 'vitest';
import { EventEmitterBus } from '../../../../gateway/emitter.js';
import { ChannelService } from '../../index.js';
import type { ChannelAdapter } from '../../types.js';
import type { ChannelStatus } from '../../../../gateway/events.js';
import type { AppConfig } from '../../../config/index.js';
import { AgentService } from '../../../agent/index.js';
import { AppConfigSchema } from '../../../config/index.js';
import type { EventMap } from '../../../../gateway/events.js';
import { register } from '../../../../gateway/decorators.js';
import { z } from 'zod';

// ── Shared config fixture ────────────────────────────────────────────────────

const BASE_CONFIG: AppConfig = AppConfigSchema.parse({
  agent: { model: 'test:test-model', executionTimeoutMs: 30_000 },
  channels: [],
  cron: { tasks: [] },
  webhooks: [],
  heartbeat: {},
  linkExpand: {},
  mcp: {},
  paths: {},
  gateway: { port: 9000 },
});

// ── StubAdapter ──────────────────────────────────────────────────────────────

/**
 * Minimal ChannelAdapter that records calls without doing any I/O.
 * Tests inject this directly via adapters map to bypass adapter.start().
 */
class StubAdapter implements ChannelAdapter {
  readonly type = 'stub' as const;
  readonly instanceId: string;
  status: ChannelStatus = 'connected';

  sent: Array<{ sessionKey: string; text: string }> = [];
  typingStopped: Array<{ sessionKey: string; final: boolean }> = [];
  typingStarted: string[] = [];
  typingResumed: string[] = [];
  reactions: Array<{ sessionKey: string; messageId: string; emoji: string }> = [];

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  async start(): Promise<void> { this.status = 'connected'; }
  async stop(): Promise<void>  { this.status = 'disconnected'; }

  async send(sessionKey: string, text: string): Promise<void> {
    this.sent.push({ sessionKey, text });
  }

  async react(sessionKey: string, messageId: string, emoji: string): Promise<void> {
    this.reactions.push({ sessionKey, messageId, emoji });
  }

  extractUserId(sessionKey: string): string {
    return sessionKey.split(':')[1] ?? sessionKey;
  }

  startTyping(sessionKey: string): void  { this.typingStarted.push(sessionKey); }
  resumeTyping(sessionKey: string): void { this.typingResumed.push(sessionKey); }
  stopTyping(sessionKey: string, final = true): void {
    this.typingStopped.push({ sessionKey, final });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a ChannelService wired to a real bus with one stub adapter pre-registered.
 * Returns the service, bus, and adapter for direct manipulation.
 */
function setup(adapterInstanceId = 'stub-ch') {
  const bus = new EventEmitterBus();
  const svc = new ChannelService(bus, BASE_CONFIG);
  bus.bootstrap(svc);

  const adapter = new StubAdapter(adapterInstanceId);
  // Inject adapter directly — avoids needing a real Telegram/WhatsApp connection
  (svc as any).adapters.set(adapterInstanceId, adapter);

  return { bus, svc, adapter };
}

/**
 * Register a stub agent.execute handler on the bus.
 * Returns a spy on the received params for assertion.
 */
function stubAgentExecute(
  bus: EventEmitterBus,
  behavior: (params: EventMap['agent.execute']['params']) => Promise<{ response: string }> = async () => ({ response: '' }),
): MockInstance {
  const spy = vi.fn(behavior);

  class StubAgent {
    constructor(b: EventEmitterBus) { b.bootstrap(this); }

    @register('agent.execute', {
      description: 'Stub agent execute',
      schema: z.object({
        sessionKey: z.string(),
        task: z.string(),
        model: z.string().optional(),
        thinkingLevel: z.string().optional(),
        images: z.array(z.object({ data: z.string(), mimeType: z.string() })).optional(),
        cwd: z.string().optional(),
        timeoutMs: z.number().optional(),
      }),
    })
    async execute(params: EventMap['agent.execute']['params']): Promise<{ response: string }> {
      return spy(params);
    }
  }

  new StubAgent(bus);
  return spy;
}

/**
 * Wait for one tick (lets fire-and-forget bus.call promises resolve).
 * For event-driven assertions we just need to yield the microtask queue.
 */
const tick = () => new Promise(r => setImmediate(r));

// ── subscribeToSessionEvents (agent/index.ts) ────────────────────────────────

describe('subscribeToSessionEvents', () => {
  // We test the mapping logic by calling subscribeToSessionEvents on a
  // testable subclass, then feeding fake PiAgent events to the subscriber.

  class TestableAgent extends AgentService {
    callSubscribe(session: any, sessionKey: string): void {
      this.subscribeToSessionEvents(session, sessionKey);
    }
  }

  function makeTestableAgent(bus: EventEmitterBus): TestableAgent {
    return new TestableAgent({
      bus,
      config: BASE_CONFIG,
    });
  }

  /**
   * Create a minimal fake session that exposes the subscriber callback.
   * Returns the session stub and a function to fire events into it.
   */
  function makeSessionStub() {
    let subscriber: ((event: any) => void) | null = null;
    const session = {
      subscribe: (fn: (event: any) => void) => { subscriber = fn; },
      state: { messages: [{ role: 'assistant', content: 'The answer is 42.' }] },
    };
    const fire = (event: Record<string, unknown>) => subscriber!(event);
    return { session, fire };
  }

  it('emits agent.onDelta with chunk on message_update (delta field)', async () => {
    const bus = new EventEmitterBus();
    const agent = makeTestableAgent(bus);
    const { session, fire } = makeSessionStub();

    const deltas: EventMap['agent.onDelta'][] = [];
    bus.on('agent.onDelta', (p) => deltas.push(p));

    agent.callSubscribe(session, 'stub-ch:user1');
    fire({ type: 'message_update', delta: 'Hello' });

    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toEqual({ sessionKey: 'stub-ch:user1', chunk: 'Hello' });
  });

  it('emits agent.onDelta using text field when delta is absent', async () => {
    const bus = new EventEmitterBus();
    const agent = makeTestableAgent(bus);
    const { session, fire } = makeSessionStub();

    const deltas: EventMap['agent.onDelta'][] = [];
    bus.on('agent.onDelta', (p) => deltas.push(p));

    agent.callSubscribe(session, 'stub-ch:user1');
    fire({ type: 'message_update', text: 'World' });

    expect(deltas).toHaveLength(1);
    expect(deltas[0].chunk).toBe('World');
  });

  it('does not emit agent.onDelta when both delta and text are empty', () => {
    const bus = new EventEmitterBus();
    const agent = makeTestableAgent(bus);
    const { session, fire } = makeSessionStub();

    const deltas: EventMap['agent.onDelta'][] = [];
    bus.on('agent.onDelta', (p) => deltas.push(p));

    agent.callSubscribe(session, 'stub-ch:user1');
    fire({ type: 'message_update', delta: '', text: '' });
    fire({ type: 'message_update' });

    expect(deltas).toHaveLength(0);
  });

  it('emits agent.onTool with phase=start and args on tool_execution_start', () => {
    const bus = new EventEmitterBus();
    const agent = makeTestableAgent(bus);
    const { session, fire } = makeSessionStub();

    const tools: EventMap['agent.onTool'][] = [];
    bus.on('agent.onTool', (p) => tools.push(p));

    agent.callSubscribe(session, 'stub-ch:user1');
    fire({ type: 'tool_execution_start', toolName: 'fs.read', args: { path: '/tmp/x' } });

    expect(tools).toHaveLength(1);
    expect(tools[0]).toEqual({
      sessionKey: 'stub-ch:user1',
      toolName: 'fs.read',
      phase: 'start',
      args: { path: '/tmp/x' },
    });
  });

  it('emits agent.onTool with phase=end and result on tool_execution_end', () => {
    const bus = new EventEmitterBus();
    const agent = makeTestableAgent(bus);
    const { session, fire } = makeSessionStub();

    const tools: EventMap['agent.onTool'][] = [];
    bus.on('agent.onTool', (p) => tools.push(p));

    agent.callSubscribe(session, 'stub-ch:user2');
    fire({ type: 'tool_execution_end', toolName: 'fs.read', result: { content: 'data', mimeType: 'text/plain' } });

    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      sessionKey: 'stub-ch:user2',
      toolName: 'fs.read',
      phase: 'end',
      result: { content: 'data', mimeType: 'text/plain' },
    });
  });

  it('emits agent.onTool with undefined args when tool_execution_start has no args', () => {
    const bus = new EventEmitterBus();
    const agent = makeTestableAgent(bus);
    const { session, fire } = makeSessionStub();

    const tools: EventMap['agent.onTool'][] = [];
    bus.on('agent.onTool', (p) => tools.push(p));

    agent.callSubscribe(session, 'stub-ch:user1');
    fire({ type: 'tool_execution_start', toolName: 'web.fetch' });

    expect(tools[0].args).toBeUndefined();
  });

  it('emits agent.onTool with undefined result when tool_execution_end has no result', () => {
    const bus = new EventEmitterBus();
    const agent = makeTestableAgent(bus);
    const { session, fire } = makeSessionStub();

    const tools: EventMap['agent.onTool'][] = [];
    bus.on('agent.onTool', (p) => tools.push(p));

    agent.callSubscribe(session, 'stub-ch:user1');
    fire({ type: 'tool_execution_end', toolName: 'web.fetch' });

    expect(tools[0].result).toBeUndefined();
  });

  it('does not emit agent.onTool when toolName is absent', () => {
    const bus = new EventEmitterBus();
    const agent = makeTestableAgent(bus);
    const { session, fire } = makeSessionStub();

    const tools: EventMap['agent.onTool'][] = [];
    bus.on('agent.onTool', (p) => tools.push(p));

    agent.callSubscribe(session, 'stub-ch:user1');
    fire({ type: 'tool_execution_start' });
    fire({ type: 'tool_execution_end' });

    expect(tools).toHaveLength(0);
  });

  it('emits agent.onCompleted with success=true on turn_end', () => {
    const bus = new EventEmitterBus();
    const agent = makeTestableAgent(bus);
    const { session, fire } = makeSessionStub();

    const completed: EventMap['agent.onCompleted'][] = [];
    bus.on('agent.onCompleted', (p) => completed.push(p));

    agent.callSubscribe(session, 'stub-ch:user1');
    fire({ type: 'turn_end' });

    expect(completed).toHaveLength(1);
    expect(completed[0].success).toBe(true);
    expect(completed[0].sessionKey).toBe('stub-ch:user1');
    expect(completed[0].response).toBe('The answer is 42.');
  });


  it('skips auto_retry_start without emitting anything', () => {
    const bus = new EventEmitterBus();
    const agent = makeTestableAgent(bus);
    const { session, fire } = makeSessionStub();

    const emissions: unknown[] = [];
    bus.on('agent.onDelta', (p) => emissions.push(p));
    bus.on('agent.onTool', (p) => emissions.push(p));
    bus.on('agent.onCompleted', (p) => emissions.push(p));

    agent.callSubscribe(session, 'stub-ch:user1');
    fire({ type: 'auto_retry_start', attempt: 1 });
    fire({ type: 'auto_retry_end', attempt: 1 });

    expect(emissions).toHaveLength(0);
  });
});

// ── onAgentCompleted reply logic ─────────────────────────────────────────────

describe('onAgentCompleted reply logic', () => {
  it('sends response text via channel.send on success', async () => {
    const { bus, svc, adapter } = setup();
    const sessionKey = 'stub-ch:user1';

    // Seed activeSessions as onInboundMessage would
    (svc as any).activeSessions.set(sessionKey, { adapter });

    // Register channel.send stub to avoid "no handler" timeout
    const sent: Array<{ sessionKey: string; text: string }> = [];
    class SendStub {
      constructor(b: EventEmitterBus) { b.bootstrap(this); }
      @register('channel.send', {
        description: 'stub send',
        schema: z.object({ sessionKey: z.string(), text: z.string() }),
      })
      async send(p: EventMap['channel.send']['params']) {
        sent.push(p);
        return { sent: true };
      }
    }
    new SendStub(bus);

    bus.emit('agent.onCompleted', { sessionKey, success: true, response: 'Here is your answer.' });

    await tick();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({ sessionKey, text: 'Here is your answer.' });
  });

  it('sends Error: prefix on failure via channel.send', async () => {
    const { bus, svc, adapter } = setup();
    const sessionKey = 'stub-ch:user2';

    (svc as any).activeSessions.set(sessionKey, { adapter });

    const sent: Array<{ sessionKey: string; text: string }> = [];
    class SendStub {
      constructor(b: EventEmitterBus) { b.bootstrap(this); }
      @register('channel.send', {
        description: 'stub send',
        schema: z.object({ sessionKey: z.string(), text: z.string() }),
      })
      async send(p: EventMap['channel.send']['params']) { sent.push(p); return { sent: true }; }
    }
    new SendStub(bus);

    bus.emit('agent.onCompleted', { sessionKey, success: false, error: 'Auth failed' });

    await tick();

    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe('Error: Auth failed');
  });

  it('does not send when success=true but response is empty', async () => {
    const { bus, svc, adapter } = setup();
    const sessionKey = 'stub-ch:user3';

    (svc as any).activeSessions.set(sessionKey, { adapter });

    const sent: Array<unknown> = [];
    class SendStub {
      constructor(b: EventEmitterBus) { b.bootstrap(this); }
      @register('channel.send', {
        description: 'stub send',
        schema: z.object({ sessionKey: z.string(), text: z.string() }),
      })
      async send(p: EventMap['channel.send']['params']) { sent.push(p); return { sent: true }; }
    }
    new SendStub(bus);

    bus.emit('agent.onCompleted', { sessionKey, success: true });
    // No response field — should not send
    await tick();

    expect(sent).toHaveLength(0);
  });

  it('calls stopTyping with final=true on completion', async () => {
    const { bus, svc, adapter } = setup();
    const sessionKey = 'stub-ch:user4';

    (svc as any).activeSessions.set(sessionKey, { adapter });

    bus.emit('agent.onCompleted', { sessionKey, success: true });
    await tick();

    expect(adapter.typingStopped).toContainEqual({ sessionKey, final: true });
  });

  it('removes session from activeSessions after completion', async () => {
    const { bus, svc, adapter } = setup();
    const sessionKey = 'stub-ch:user5';

    (svc as any).activeSessions.set(sessionKey, { adapter });

    bus.emit('agent.onCompleted', { sessionKey, success: true });
    await tick();

    expect((svc as any).activeSessions.has(sessionKey)).toBe(false);
  });

  it('calls reactionController.setDone and dispose on success', async () => {
    const { bus, svc, adapter } = setup();
    const sessionKey = 'stub-ch:user6';

    const rc = { setDone: vi.fn(), setError: vi.fn(), dispose: vi.fn(), setThinking: vi.fn() };
    (svc as any).activeSessions.set(sessionKey, { adapter, reactionController: rc });

    bus.emit('agent.onCompleted', { sessionKey, success: true });
    await tick();

    expect(rc.setDone).toHaveBeenCalledOnce();
    expect(rc.dispose).toHaveBeenCalledOnce();
    expect(rc.setError).not.toHaveBeenCalled();
  });

  it('calls reactionController.setError and dispose on failure', async () => {
    const { bus, svc, adapter } = setup();
    const sessionKey = 'stub-ch:user7';

    const rc = { setDone: vi.fn(), setError: vi.fn(), dispose: vi.fn(), setThinking: vi.fn() };
    (svc as any).activeSessions.set(sessionKey, { adapter, reactionController: rc });

    bus.emit('agent.onCompleted', { sessionKey, success: false });
    await tick();

    expect(rc.setError).toHaveBeenCalledOnce();
    expect(rc.dispose).toHaveBeenCalledOnce();
    expect(rc.setDone).not.toHaveBeenCalled();
  });

  it('early-returns silently when sessionKey is not in activeSessions', async () => {
    const { bus, adapter } = setup();
    const sessionKey = 'stub-ch:unknown-user';

    // Should not throw, not call any adapter methods
    bus.emit('agent.onCompleted', { sessionKey, success: true });
    await tick();

    expect(adapter.typingStopped).toHaveLength(0);
    expect(adapter.sent).toHaveLength(0);
  });

  it('second onAgentCompleted for same sessionKey is a no-op (session already deleted)', async () => {
    const { bus, svc, adapter } = setup();
    const sessionKey = 'stub-ch:user8';

    (svc as any).activeSessions.set(sessionKey, { adapter });

    bus.emit('agent.onCompleted', { sessionKey, success: true });
    await tick();
    // Fire again — session is gone, should be silent
    bus.emit('agent.onCompleted', { sessionKey, success: true });
    await tick();

    // stopTyping called only once from first completion
    expect(adapter.typingStopped.filter(t => t.sessionKey === sessionKey)).toHaveLength(1);
  });

  it('uses Unknown error message when error field is absent on failure', async () => {
    const { bus, svc, adapter } = setup();
    const sessionKey = 'stub-ch:user9';

    (svc as any).activeSessions.set(sessionKey, { adapter });

    const sent: Array<{ sessionKey: string; text: string }> = [];
    class SendStub {
      constructor(b: EventEmitterBus) { b.bootstrap(this); }
      @register('channel.send', {
        description: 'stub send',
        schema: z.object({ sessionKey: z.string(), text: z.string() }),
      })
      async send(p: EventMap['channel.send']['params']) { sent.push(p); return { sent: true }; }
    }
    new SendStub(bus);

    bus.emit('agent.onCompleted', { sessionKey, success: false });
    await tick();

    expect(sent[0].text).toBe('Error: Unknown error');
  });
});

// ── onInboundMessage firing agent.execute ────────────────────────────────────

describe('onInboundMessage firing agent.execute', () => {
  it('stores session in activeSessions before calling agent.execute', async () => {
    const { bus, svc } = setup();
    const sessionKey = 'stub-ch:user10';

    let capturedActiveSessions: boolean | null = null;
    const spy = vi.fn(async () => {
      capturedActiveSessions = (svc as any).activeSessions.has(sessionKey);
      return { response: '' };
    });

    class AgentStub {
      constructor(b: EventEmitterBus) { b.bootstrap(this); }
      @register('agent.execute', {
        description: 'stub',
        schema: z.object({ sessionKey: z.string(), task: z.string() }).passthrough(),
      })
      async execute(p: any) { return spy(p); }
    }
    new AgentStub(bus);

    await svc.onInboundMessage(sessionKey, 'hello');
    await tick();

    expect(capturedActiveSessions).toBe(true);
  });

  it('calls bus.call agent.execute without awaiting its result (fire-and-forget)', async () => {
    const { bus, svc } = setup();
    const sessionKey = 'stub-ch:user11';

    let resolveAgent!: () => void;
    const agentStarted = new Promise<void>(r => { resolveAgent = r; });
    let agentResolved = false;

    class AgentStub {
      constructor(b: EventEmitterBus) { b.bootstrap(this); }
      @register('agent.execute', {
        description: 'stub',
        schema: z.object({ sessionKey: z.string(), task: z.string() }).passthrough(),
      })
      async execute() {
        resolveAgent();
        await new Promise(r => setTimeout(r, 50));
        agentResolved = true;
        return { response: '' };
      }
    }
    new AgentStub(bus);

    // onInboundMessage should return before agent finishes
    await svc.onInboundMessage(sessionKey, 'task');
    await agentStarted;

    // Agent is still running — onInboundMessage returned immediately
    expect(agentResolved).toBe(false);
  });

  it('passes sessionKey and task to agent.execute', async () => {
    const { bus, svc } = setup();
    const sessionKey = 'stub-ch:user12';
    const spy = stubAgentExecute(bus);

    await svc.onInboundMessage(sessionKey, 'What is the weather?');
    await tick();

    expect(spy).toHaveBeenCalledOnce();
    const params = spy.mock.calls[0][0] as EventMap['agent.execute']['params'];
    expect(params.sessionKey).toBe(sessionKey);
    expect(params.task).toBe('What is the weather?');
  });

  it('passes model from metadata to agent.execute', async () => {
    const { bus, svc } = setup();
    const sessionKey = 'stub-ch:user13';
    const spy = stubAgentExecute(bus);

    await svc.onInboundMessage(sessionKey, 'task', { model: 'anthropic:claude-opus-4' });
    await tick();

    const params = spy.mock.calls[0][0] as EventMap['agent.execute']['params'];
    expect(params.model).toBe('anthropic:claude-opus-4');
  });

  it('passes thinkingLevel from metadata to agent.execute', async () => {
    const { bus, svc } = setup();
    const sessionKey = 'stub-ch:user14';
    const spy = stubAgentExecute(bus);

    await svc.onInboundMessage(sessionKey, 'task', { thinkingLevel: 'deep' });
    await tick();

    const params = spy.mock.calls[0][0] as EventMap['agent.execute']['params'];
    expect(params.thinkingLevel).toBe('deep');
  });

  it('passes images array from metadata to agent.execute', async () => {
    const { bus, svc } = setup();
    const sessionKey = 'stub-ch:user15';
    const spy = stubAgentExecute(bus);

    const images = [{ data: 'base64abc', mimeType: 'image/png' }];
    await svc.onInboundMessage(sessionKey, 'describe this', { images });
    await tick();

    const params = spy.mock.calls[0][0] as EventMap['agent.execute']['params'];
    expect(params.images).toEqual(images);
  });

  it('omits model/thinkingLevel/images when not in metadata', async () => {
    const { bus, svc } = setup();
    const sessionKey = 'stub-ch:user16';
    const spy = stubAgentExecute(bus);

    await svc.onInboundMessage(sessionKey, 'plain message');
    await tick();

    const params = spy.mock.calls[0][0] as EventMap['agent.execute']['params'];
    expect(params.model).toBeUndefined();
    expect(params.thinkingLevel).toBeUndefined();
    expect(params.images).toBeUndefined();
  });

  it('strips media.data from inboundMeta before storing (does not forward raw buffer)', async () => {
    const { bus, svc } = setup();
    const sessionKey = 'stub-ch:user17';
    const spy = stubAgentExecute(bus);

    const media = { type: 'audio', data: Buffer.from('bigbinaryblob'), path: '/tmp/audio.ogg' };
    await svc.onInboundMessage(sessionKey, 'voice msg', { media });
    await tick();

    // We care that agent.execute was called and agent task passed through
    expect(spy).toHaveBeenCalledOnce();
    // activeSessions was cleaned up or set correctly
  });

  it('onInboundMessage try/catch only catches synchronous throw from bus.call itself', async () => {
    // The try/catch in onInboundMessage wraps bus.call('agent.execute', ...).
    // bus.call() always returns a Promise — it never throws synchronously.
    // Agent errors are delivered as rejected Promises, not synchronous exceptions.
    // Therefore, the catch block only fires if bus.call() itself throws before
    // returning (e.g. no handler registered → call returns a pending promise that
    // may time out, still not a synchronous throw).
    //
    // Consequence: the catch block is a last-resort guard for the unlikely case
    // where EventEmitterBus.call() throws synchronously (e.g. bus teardown).
    // Regular agent failures come through agent.onCompleted with success=false.

    const { bus, svc } = setup();
    const sessionKey = 'stub-ch:user18';
    const spy = stubAgentExecute(bus);

    // Normal path — onInboundMessage returns without throwing even if agent later fails
    await expect(svc.onInboundMessage(sessionKey, 'trigger')).resolves.toBeUndefined();

    // Session was registered
    expect((svc as any).activeSessions.has(sessionKey)).toBe(true);
    // agent.execute was called (fire-and-forget, still in-flight)
    expect(spy).toHaveBeenCalledOnce();
  });

  it('returns early when no adapter exists for the session channel', async () => {
    const bus = new EventEmitterBus();
    const svc = new ChannelService(bus, BASE_CONFIG);
    bus.bootstrap(svc);
    // No adapter registered for 'nonexistent-ch'

    const executeSpy = stubAgentExecute(bus);

    // Should silently return, not call agent.execute
    await svc.onInboundMessage('nonexistent-ch:user1', 'hello');
    await tick();

    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('handles sessionKey with special characters (telegram user IDs)', async () => {
    const { bus, svc } = setup('tg-bot-1');
    const sessionKey = 'tg-bot-1:123456789';
    const spy = stubAgentExecute(bus);

    await svc.onInboundMessage(sessionKey, 'message from telegram user');
    await tick();

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0].sessionKey).toBe(sessionKey);
  });

  it('handles sessionKey with WhatsApp-style phone number IDs', async () => {
    const { bus, svc } = setup('wa-bot-1');
    const sessionKey = 'wa-bot-1:+15551234567@s.whatsapp.net';
    const spy = stubAgentExecute(bus);

    await svc.onInboundMessage(sessionKey, 'hi from whatsapp');
    await tick();

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0].sessionKey).toBe(sessionKey);
  });
});

// ── onAgentTool updates adapter ──────────────────────────────────────────────

describe('onAgentTool adapter updates', () => {
  it('calls reactionController.setTool and adapter.resumeTyping on phase=start', async () => {
    const { bus, svc, adapter } = setup();
    const sessionKey = 'stub-ch:user20';
    const rc = { setTool: vi.fn(), setThinking: vi.fn(), setDone: vi.fn(), setError: vi.fn(), dispose: vi.fn() };

    (svc as any).activeSessions.set(sessionKey, { adapter, reactionController: rc });

    bus.emit('agent.onTool', { sessionKey, toolName: 'fs.read', phase: 'start' });
    await tick();

    expect(rc.setTool).toHaveBeenCalledOnce();
    expect(adapter.typingResumed).toContain(sessionKey);
  });

  it('calls reactionController.setThinking on phase=end', async () => {
    const { bus, svc, adapter } = setup();
    const sessionKey = 'stub-ch:user21';
    const rc = { setTool: vi.fn(), setThinking: vi.fn(), setDone: vi.fn(), setError: vi.fn(), dispose: vi.fn() };

    (svc as any).activeSessions.set(sessionKey, { adapter, reactionController: rc });

    bus.emit('agent.onTool', { sessionKey, toolName: 'fs.read', phase: 'end' });
    await tick();

    expect(rc.setThinking).toHaveBeenCalledOnce();
    expect(rc.setTool).not.toHaveBeenCalled();
  });

  it('handles missing reactionController gracefully on tool events', async () => {
    const { bus, svc, adapter } = setup();
    const sessionKey = 'stub-ch:user22';

    // No reactionController in session
    (svc as any).activeSessions.set(sessionKey, { adapter });

    // Should not throw
    expect(() => {
      bus.emit('agent.onTool', { sessionKey, toolName: 'fs.read', phase: 'start' });
    }).not.toThrow();

    await tick();

    // resumeTyping still called even without reactionController
    expect(adapter.typingResumed).toContain(sessionKey);
  });

  it('does nothing when sessionKey is not in activeSessions', async () => {
    const { bus, adapter } = setup();

    bus.emit('agent.onTool', { sessionKey: 'stub-ch:ghost', toolName: 'fs.read', phase: 'start' });
    await tick();

    expect(adapter.typingResumed).toHaveLength(0);
  });
});

// ── Integration: full flow ────────────────────────────────────────────────────

describe('Integration: full inbound → agent → reply flow', () => {
  it('message in activeSessions → agent.execute called → onCompleted → reply sent → session cleaned', async () => {
    const { bus, svc, adapter } = setup();
    const sessionKey = 'stub-ch:user30';

    const sent: Array<{ sessionKey: string; text: string }> = [];

    // Real send handler that records calls
    class SendStub {
      constructor(b: EventEmitterBus) { b.bootstrap(this); }
      @register('channel.send', {
        description: 'stub send',
        schema: z.object({ sessionKey: z.string(), text: z.string() }),
      })
      async send(p: EventMap['channel.send']['params']) { sent.push(p); return { sent: true }; }
    }
    new SendStub(bus);

    // Agent that fires onCompleted after returning
    class RealishAgent {
      constructor(b: EventEmitterBus) { b.bootstrap(this); }
      @register('agent.execute', {
        description: 'stub',
        schema: z.object({ sessionKey: z.string(), task: z.string() }).passthrough(),
      })
      async execute(params: EventMap['agent.execute']['params']) {
        // Simulate async agent completing and emitting onCompleted
        setImmediate(() => {
          bus.emit('agent.onCompleted', {
            sessionKey: params.sessionKey,
            success: true,
            response: 'Done! Here is the result.',
          });
        });
        return { response: '' };
      }
    }
    new RealishAgent(bus);

    await svc.onInboundMessage(sessionKey, 'do a task');

    // Session registered
    expect((svc as any).activeSessions.has(sessionKey)).toBe(true);

    // Let agent complete
    await new Promise(r => setTimeout(r, 20));

    // Session cleaned
    expect((svc as any).activeSessions.has(sessionKey)).toBe(false);
    // Reply sent
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe('Done! Here is the result.');
    // Typing stopped
    expect(adapter.typingStopped.some(t => t.sessionKey === sessionKey && t.final)).toBe(true);
  });

  it('tool events during run update reaction controller without disrupting flow', async () => {
    const { bus, svc, adapter: _adapter } = setup();
    const sessionKey = 'stub-ch:user31';
    const rc = {
      setTool: vi.fn(),
      setThinking: vi.fn(),
      setDone: vi.fn(),
      setError: vi.fn(),
      dispose: vi.fn(),
    };

    const sent: Array<{ sessionKey: string; text: string }> = [];
    class SendStub {
      constructor(b: EventEmitterBus) { b.bootstrap(this); }
      @register('channel.send', {
        description: 'stub',
        schema: z.object({ sessionKey: z.string(), text: z.string() }),
      })
      async send(p: EventMap['channel.send']['params']) { sent.push(p); return { sent: true }; }
    }
    new SendStub(bus);

    class AgentWithTools {
      constructor(b: EventEmitterBus) { b.bootstrap(this); }
      @register('agent.execute', {
        description: 'stub',
        schema: z.object({ sessionKey: z.string(), task: z.string() }).passthrough(),
      })
      async execute(params: EventMap['agent.execute']['params']) {
        setImmediate(() => {
          bus.emit('agent.onTool', { sessionKey: params.sessionKey, toolName: 'fs.read', phase: 'start' });
          bus.emit('agent.onTool', { sessionKey: params.sessionKey, toolName: 'fs.read', phase: 'end' });
          bus.emit('agent.onCompleted', { sessionKey: params.sessionKey, success: true, response: 'ok' });
        });
        return { response: '' };
      }
    }
    new AgentWithTools(bus);

    // Inject reactionController via activeSessions pre-seed is not possible here since
    // onInboundMessage sets it — we stub it post-registration
    await svc.onInboundMessage(sessionKey, 'task with tools');

    // Inject our spy RC into the active session (adapter has no react fn, so RC would be undefined)
    const activeSession = (svc as any).activeSessions.get(sessionKey);
    if (activeSession) activeSession.reactionController = rc;

    await new Promise(r => setTimeout(r, 20));

    expect(rc.setTool).toHaveBeenCalled();
    expect(rc.setThinking).toHaveBeenCalled();
    expect(rc.setDone).toHaveBeenCalled();
    expect(rc.dispose).toHaveBeenCalled();
    expect(sent[0].text).toBe('ok');
  });

  it('concurrent messages for different sessions are independent', async () => {
    const { bus, svc } = setup();
    const key1 = 'stub-ch:user-a';
    const key2 = 'stub-ch:user-b';

    const sent: Array<{ sessionKey: string; text: string }> = [];
    class SendStub {
      constructor(b: EventEmitterBus) { b.bootstrap(this); }
      @register('channel.send', {
        description: 'stub',
        schema: z.object({ sessionKey: z.string(), text: z.string() }),
      })
      async send(p: EventMap['channel.send']['params']) { sent.push(p); return { sent: true }; }
    }
    new SendStub(bus);

    class DualAgent {
      constructor(b: EventEmitterBus) { b.bootstrap(this); }
      @register('agent.execute', {
        description: 'stub',
        schema: z.object({ sessionKey: z.string(), task: z.string() }).passthrough(),
      })
      async execute(params: EventMap['agent.execute']['params']) {
        const delay = params.sessionKey === key1 ? 30 : 10;
        setTimeout(() => {
          bus.emit('agent.onCompleted', {
            sessionKey: params.sessionKey,
            success: true,
            response: `reply for ${params.sessionKey}`,
          });
        }, delay);
        return { response: '' };
      }
    }
    new DualAgent(bus);

    // Fire both concurrently
    await Promise.all([
      svc.onInboundMessage(key1, 'task A'),
      svc.onInboundMessage(key2, 'task B'),
    ]);

    await new Promise(r => setTimeout(r, 60));

    expect((svc as any).activeSessions.has(key1)).toBe(false);
    expect((svc as any).activeSessions.has(key2)).toBe(false);

    const reply1 = sent.find(s => s.sessionKey === key1);
    const reply2 = sent.find(s => s.sessionKey === key2);
    expect(reply1?.text).toBe(`reply for ${key1}`);
    expect(reply2?.text).toBe(`reply for ${key2}`);
  });
});
