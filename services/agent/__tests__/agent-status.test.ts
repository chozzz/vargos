import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AgentService } from '../index.js';
import { AppConfigSchema } from '../../config/index.js';
import type { Bus } from '../../../core/types.js';
import { resetDataPaths } from '../../../lib/paths.js';
import type { AgentSession } from '@earendil-works/pi-coding-agent';

// ── Fakes ──────────────────────────────────────────────────────────────────

interface FakeModel { provider: string; id: string; }

/** A minimal AgentSession stand-in. `prompt` is deferred so tests can hold a run open. */
function fakeSession(model: FakeModel, prompt?: () => Promise<void>) {
  return {
    model,
    prompt: prompt ?? (async () => {}),
    setThinkingLevel: vi.fn(),
    subscribe: vi.fn(),
    state: { messages: [{ role: 'assistant', content: 'done' }] },
    dispose: vi.fn(),
  } as unknown as AgentSession;
}

class TestableRuntime extends AgentService {
  inject(key: string, session: AgentSession, startedAt = Date.now()) {
    this.sessions.set(key, session);
    this.sessionMeta.set(key, startedAt);
  }
  markRunning(key: string) { this.activeRuns.add(key); }
  testStatus(p: { sessionKey?: string }) { return this['status'](p); }
  testExecute(p: { sessionKey?: string; task: string }) { return this['execute'](p); }
}

async function createRuntime(dataDir: string): Promise<TestableRuntime> {
  const config = AppConfigSchema.parse({
    providers: { test: { baseUrl: 'http://localhost:1234', apiKey: 'test-key', api: 'openai-completions', models: [{ id: 'model-a', name: 'Model A' }] } },
    agent: { model: 'test:model-a' },
  });

  process.env.VARGOS_DATA_DIR = dataDir;
  resetDataPaths();

  const bus = {
    call: async (event: string) => (event === 'config.get' ? config : {}),
    register: () => () => {},
    on: () => () => {},
    emit: () => {},
    has: () => false,
    list: () => [],
  } as unknown as Bus;

  const runtime = new TestableRuntime();
  await runtime.init(bus);
  return runtime;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('agent.status', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `agent-status-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(path.join(tmpDir, 'workspace'), { recursive: true });
    originalEnv = process.env.VARGOS_DATA_DIR;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.VARGOS_DATA_DIR;
    else process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports idle sessions from the cache with model and startedAt', async () => {
    const runtime = await createRuntime(tmpDir);
    runtime.inject('telegram:u1', fakeSession({ provider: 'test', id: 'model-a' }), 12345);
    const { sessions } = await runtime.testStatus({});
    expect(sessions).toEqual([
      { sessionKey: 'telegram:u1', state: 'idle', parentKey: undefined, model: 'test:model-a', startedAt: 12345 },
    ]);
  });

  it('reports running sessions while execute is in flight', async () => {
    const runtime = await createRuntime(tmpDir);
    let resolvePrompt!: () => void;
    const promptDone = new Promise<void>(r => { resolvePrompt = r; });
    runtime.inject('telegram:u1', fakeSession({ provider: 'test', id: 'model-a' }, () => promptDone));

    const run = runtime.testExecute({ sessionKey: 'telegram:u1', task: 'hi' });
    await new Promise(r => setTimeout(r, 0));

    const running = await runtime.testStatus({});
    expect(running.sessions[0].state).toBe('running');
    expect(running.activeRuns).toContain('telegram:u1');

    resolvePrompt();
    await run;

    expect((await runtime.testStatus({})).sessions[0].state).toBe('idle');
  });

  it('returns an empty inventory when nothing is cached', async () => {
    const runtime = await createRuntime(tmpDir);
    expect(await runtime.testStatus({})).toEqual({ sessions: [], activeRuns: [] });
  });

  it('lists every cached session', async () => {
    const runtime = await createRuntime(tmpDir);
    runtime.inject('telegram:a', fakeSession({ provider: 'test', id: 'model-a' }));
    runtime.inject('cron:nightly:2026-06-07', fakeSession({ provider: 'test', id: 'model-a' }));
    runtime.inject('cli:42', fakeSession({ provider: 'test', id: 'model-a' }));
    const { sessions } = await runtime.testStatus({});
    expect(sessions.map(s => s.sessionKey).sort()).toEqual(['cli:42', 'cron:nightly:2026-06-07', 'telegram:a']);
  });

  it('reports model as undefined when the session has no model', async () => {
    const runtime = await createRuntime(tmpDir);
    runtime.inject('telegram:u1', { state: { messages: [] } } as unknown as AgentSession);
    expect((await runtime.testStatus({})).sessions[0].model).toBeUndefined();
  });

  it('parses the parent key from subagent sessions', async () => {
    const runtime = await createRuntime(tmpDir);
    runtime.inject('telegram:123:subagent:abcd1234', fakeSession({ provider: 'test', id: 'model-a' }));
    expect((await runtime.testStatus({})).sessions[0].parentKey).toBe('telegram:123');
  });

  it('scopes both sessions and activeRuns to a session and its subagents', async () => {
    const runtime = await createRuntime(tmpDir);
    runtime.inject('telegram:123', fakeSession({ provider: 'test', id: 'model-a' }));
    runtime.inject('telegram:123:subagent:abcd1234', fakeSession({ provider: 'test', id: 'model-a' }));
    runtime.inject('telegram:999', fakeSession({ provider: 'test', id: 'model-a' }));
    runtime.markRunning('telegram:123:subagent:abcd1234');
    runtime.markRunning('telegram:999');

    const { sessions, activeRuns } = await runtime.testStatus({ sessionKey: 'telegram:123' });
    expect(sessions.map(s => s.sessionKey).sort()).toEqual(['telegram:123', 'telegram:123:subagent:abcd1234']);
    expect(activeRuns).toEqual(['telegram:123:subagent:abcd1234']);
  });

  it('keeps activeRuns for backwards compatibility', async () => {
    const runtime = await createRuntime(tmpDir);
    runtime.inject('telegram:u1', fakeSession({ provider: 'test', id: 'model-a' }));
    const result = await runtime.testStatus({});
    expect(result.activeRuns).toEqual([]);
    expect(result.sessions).toHaveLength(1);
  });
});
