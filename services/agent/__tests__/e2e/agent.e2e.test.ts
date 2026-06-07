/**
 * Agent service E2E — drives the REAL AgentService over a real EventEmitterBus.
 *
 * Unlike channels.e2e (which stubs agent.execute), this exercises the actual
 * execute → getOrCreateSession → status pipeline, the directive parsing, the
 * model-override resolution, and the PiAgent→bus event bridge.
 *
 * The only seam is createPiSession(): overridden to return a controllable fake
 * session, so no network/model auth is needed. Everything else runs for real.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { EventEmitterBus } from '../../../../gateway/emitter.js';
import { AgentService } from '../../index.js';
import { AppConfigSchema } from '../../../config/index.js';
import { register } from '../../../../gateway/decorators.js';
import type { EventMap } from '../../../../gateway/events.js';
import { resetDataPaths } from '../../../../lib/paths.js';
import type { CreateAgentSessionOptions, CreateAgentSessionResult } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';

interface FakeModel { provider: string; id: string; }

/** A fake AgentSession that streams PiAgent events through the real subscriber. */
function makeFakeSession(model: FakeModel) {
  let subscriber: ((event: any) => void) | null = null;
  const session: any = {
    model,
    systemPrompt: '',
    state: { messages: [] as any[] },
    sessionManager: { getSessionFile: () => undefined, appendMessage: vi.fn() },
    subscribe: (fn: (event: any) => void) => { subscriber = fn; },
    setThinkingLevel: vi.fn(),
    setModel: vi.fn(async (m: FakeModel) => { session.model = m; }),
    dispose: vi.fn(),
    exportToJsonl: vi.fn(),
    promptArgs: undefined as undefined | { task: string },
    prompt: vi.fn(async (task: string) => {
      session.promptArgs = { task };
      subscriber?.({ type: 'message_update', delta: 'Hi ' });
      subscriber?.({ type: 'tool_execution_start', toolName: 'web.fetch', args: {} });
      subscriber?.({ type: 'tool_execution_end', toolName: 'web.fetch', result: {} });
      session.state.messages.push({ role: 'assistant', content: 'Hi there', stopReason: 'stop' });
      subscriber?.({ type: 'agent_end' });
    }),
  };
  return session;
}

class E2EAgent extends AgentService {
  createdWith: CreateAgentSessionOptions[] = [];

  protected createPiSession(options: CreateAgentSessionOptions): Promise<CreateAgentSessionResult> {
    this.createdWith.push(options);
    const model = (options.model as unknown as FakeModel) ?? { provider: 'test', id: 'model-a' };
    return Promise.resolve({ session: makeFakeSession(model) } as unknown as CreateAgentSessionResult);
  }
}

/** Stub bus.search so the real getCustomTools() resolves instead of timing out. */
class BusSearchStub {
  constructor(bus: EventEmitterBus) { bus.bootstrap(this); }
  @register('bus.search', { description: 'stub', schema: z.object({}) })
  async search() { return []; }
}

const MODELS_JSON = JSON.stringify({
  providers: {
    test: {
      baseUrl: 'http://localhost:1234',
      api: 'openai-completions',
      apiKey: 'test-key',
      models: [
        { id: 'model-a', name: 'Model A' },
        { id: 'model-b', name: 'Model B' },
      ],
    },
  },
});

function setup(dataDir: string) {
  resetDataPaths();
  process.env.VARGOS_DATA_DIR = dataDir;

  const config = AppConfigSchema.parse({
    providers: {
      test: {
        baseUrl: 'http://localhost:1234',
        apiKey: 'test-key',
        api: 'openai-completions',
        models: [{ id: 'model-a', name: 'Model A' }],
      },
    },
    agent: { model: 'test:model-a' },
  });

  const bus = new EventEmitterBus();
  new BusSearchStub(bus);
  const agent = new E2EAgent({ bus, config });
  bus.bootstrap(agent);
  return { bus, agent };
}

describe('agent E2E (real service over real bus)', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `agent-e2e-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(path.join(tmpDir, 'workspace'), { recursive: true });
    mkdirSync(path.join(tmpDir, 'agent'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'agent', 'models.json'), MODELS_JSON);
    originalEnv = process.env.VARGOS_DATA_DIR;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.VARGOS_DATA_DIR;
    else process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('execute returns the response and streams onDelta/onTool/onCompleted on the bus', async () => {
    const { bus } = setup(tmpDir);

    const deltas: EventMap['agent.onDelta'][] = [];
    const tools: EventMap['agent.onTool'][] = [];
    const completed: EventMap['agent.onCompleted'][] = [];
    bus.on('agent.onDelta', p => deltas.push(p));
    bus.on('agent.onTool', p => tools.push(p));
    bus.on('agent.onCompleted', p => completed.push(p));

    const result = await bus.call('agent.execute', { sessionKey: 'cli:1', task: 'hello' });

    expect(result.response).toBe('Hi there');
    expect(deltas.map(d => d.chunk)).toEqual(['Hi ']);
    expect(tools.map(t => t.phase)).toEqual(['start', 'end']);
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ sessionKey: 'cli:1', success: true });
  });

  it('caches the session and surfaces it via agent.status afterwards', async () => {
    const { bus } = setup(tmpDir);

    await bus.call('agent.execute', { sessionKey: 'cli:1', task: 'hello' });
    const status = await bus.call('agent.status', {});

    expect(status.sessions).toHaveLength(1);
    expect(status.sessions[0]).toMatchObject({
      sessionKey: 'cli:1',
      state: 'idle',
      model: 'test:model-a',
    });
    expect(status.sessions[0].startedAt).toBeGreaterThan(0);
  });

  it('applies a valid model override end-to-end (visible in status)', async () => {
    const { bus, agent } = setup(tmpDir);

    await bus.call('agent.execute', { sessionKey: 'cli:1', task: 'hello', model: 'test:model-b' });

    expect(agent.createdWith[0].model).toMatchObject({ provider: 'test', id: 'model-b' });
    const status = await bus.call('agent.status', {});
    expect(status.sessions[0].model).toBe('test:model-b');
  });

  it('ignores an invalid model override and runs with the default', async () => {
    const { bus, agent } = setup(tmpDir);

    const result = await bus.call('agent.execute', { sessionKey: 'cli:1', task: 'hello', model: 'bogus:nope' });

    expect(result.response).toBe('Hi there');
    expect('model' in agent.createdWith[0]).toBe(false); // unknown override never reaches createPiSession
    const status = await bus.call('agent.status', {});
    expect(status.sessions[0].model).toBe('test:model-a');
  });

  it('strips directives and applies thinking level before prompting', async () => {
    const { bus, agent } = setup(tmpDir);

    await bus.call('agent.execute', { sessionKey: 'cli:1', task: '/think high /verbose do the thing' });

    const session = (agent as any).sessions.get('cli:1');
    expect(session.promptArgs.task).toBe('do the thing'); // directives stripped
    expect(session.setThinkingLevel).toHaveBeenCalledWith('high');
  });

  it('exposes the parent→subagent relationship in status, scoped to a subtree', async () => {
    const { bus } = setup(tmpDir);
    const parent = 'telegram:42';
    const child = 'telegram:42:subagent:abcd1234';

    await bus.call('agent.execute', { sessionKey: parent, task: 'parent task' });
    await bus.call('agent.execute', { sessionKey: child, task: 'child task' });
    await bus.call('agent.execute', { sessionKey: 'telegram:99', task: 'unrelated' });

    const scoped = await bus.call('agent.status', { sessionKey: parent });

    expect(scoped.sessions.map(s => s.sessionKey).sort()).toEqual([parent, child]);
    const childInfo = scoped.sessions.find(s => s.sessionKey === child);
    expect(childInfo?.parentKey).toBe(parent);
  });
});
