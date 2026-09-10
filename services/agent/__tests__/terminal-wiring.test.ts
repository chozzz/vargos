import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AgentService } from '../index.js';
import { AppConfigSchema } from '../../config/index.js';
import type { Bus } from '../../../core/types.js';
import { resetDataPaths } from '../../../lib/paths.js';
import type { AgentSession, CreateAgentSessionOptions, CreateAgentSessionResult } from '@earendil-works/pi-coding-agent';
import type { TerminalSpec } from '../../../lib/terminal.js';
import type { TerminalBackend } from '../terminal/types.js';

// ── Fakes ──────────────────────────────────────────────────────────────────

function fakeSession() {
  const session = {
    model: undefined,
    setModel: vi.fn(),
    subscribe: vi.fn(),
    systemPrompt: '',
    state: { messages: [] },
    dispose: vi.fn(),
  };
  return session as unknown as AgentSession;
}

class FakeBackend implements TerminalBackend {
  readonly spec: TerminalSpec;
  readonly connect = vi.fn(async () => { });
  readonly dispose = vi.fn(async () => { });
  readonly resolveCwd = vi.fn(async () => '/remote/x');
  readonly bash = { exec: vi.fn() };
  readonly read = { readFile: vi.fn(), access: vi.fn() };
  readonly write = { writeFile: vi.fn(), mkdir: vi.fn() };
  readonly edit = { readFile: vi.fn(), writeFile: vi.fn(), access: vi.fn() };
  readonly find = { exists: vi.fn(), glob: vi.fn() };
  readonly ls = { exists: vi.fn(), stat: vi.fn(), readdir: vi.fn() };

  constructor(spec: TerminalSpec) {
    this.spec = spec;
  }
}

const BUS_METHODS = [
  { name: 'memory.search', description: 'Search memory', schema: {}, internal: false },
  { name: 'agent.execute', description: 'Execute a task', schema: {}, internal: false },
];

class TestableRuntime extends AgentService {
  lastCreateOptions?: CreateAgentSessionOptions;
  lastBackend?: FakeBackend;
  callLog: Array<{ event: string; params: Record<string, unknown> }> = [];

  protected async createBackend(spec: TerminalSpec): Promise<TerminalBackend> {
    const backend = new FakeBackend(spec);
    this.lastBackend = backend;
    await backend.connect();
    return backend;
  }

  protected createPiSession(options: CreateAgentSessionOptions): Promise<CreateAgentSessionResult> {
    this.lastCreateOptions = options;
    return Promise.resolve({ session: fakeSession() } as unknown as CreateAgentSessionResult);
  }

  testGetOrCreate(key: string, opts?: { cwd?: string; model?: string }) {
    return this.getOrCreateSession(key, opts);
  }
  testCustomTools(key: string, patterns?: string[], inheritedCwd?: string) {
    return this.getCustomTools(key, patterns, inheritedCwd);
  }
}

async function createRuntime(dataDir: string): Promise<TestableRuntime> {
  const config = AppConfigSchema.parse({
    providers: { test: { baseUrl: 'http://localhost:1234', apiKey: 'test-key', api: 'openai-completions', models: [{ id: 'model-a', name: 'Model A' }] } },
    agent: { model: 'test:model-a' },
  });

  process.env.VARGOS_DATA_DIR = dataDir;
  resetDataPaths();

  const runtime = new TestableRuntime();
  const bus = {
    call: async (event: string, params: Record<string, unknown>) => {
      if (event === 'config.get') return config;
      runtime.callLog.push({ event, params });
      return {};
    },
    register: () => () => { },
    on: () => () => { },
    emit: () => { },
    has: () => false,
    list: () => BUS_METHODS,
  } as unknown as Bus;
  await runtime.init(bus);
  return runtime;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('terminal backend session wiring', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `terminal-wiring-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(path.join(tmpDir, 'workspace'), { recursive: true });
    originalEnv = process.env.VARGOS_DATA_DIR;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.VARGOS_DATA_DIR;
    else process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('local cwd: zero behavior change (no backend, SDK cwd = configured cwd)', async () => {
    const runtime = await createRuntime(tmpDir);
    await runtime.testGetOrCreate('telegram:u1', { cwd: '/home/choz/dev/vargos' });

    expect(runtime.lastBackend).toBeUndefined();
    expect(runtime.lastCreateOptions?.cwd).toBe('/home/choz/dev/vargos');
    const names = (runtime.lastCreateOptions?.customTools ?? []).map(t => t.name);
    // Bus tools only — no shadowing of the built-ins for local sessions.
    expect(names.sort()).toEqual(['agent-execute', 'memory-search']);
    expect(runtime.lastCreateOptions?.excludeTools).toBeUndefined();
  });

  it('ssh cwd: SDK session stays local, remote tools shadow the built-ins', async () => {
    const runtime = await createRuntime(tmpDir);
    const spec = 'ssh -i /k/key user@192.0.2.206:/remote/x';
    await runtime.testGetOrCreate('telegram:u1', { cwd: spec });

    expect(runtime.lastBackend).toBeDefined();
    expect(runtime.lastBackend?.connect).toHaveBeenCalledOnce();
    expect(runtime.lastBackend?.spec).toMatchObject({ kind: 'ssh', user: "user", host: '192.0.2.206', cwd: '/remote/x' });

    // SDK session machinery stays on the local workspace dir.
    expect(runtime.lastCreateOptions?.cwd).toBe(path.join(tmpDir, 'workspace'));

    // Bus tools + the seven remote-backed built-ins (grep included), same names as the built-ins.
    const names = (runtime.lastCreateOptions?.customTools ?? []).map(t => t.name);
    expect(names).toEqual(expect.arrayContaining(['read', 'bash', 'edit', 'write', 'find', 'ls', 'grep']));
    expect(names).toEqual(expect.arrayContaining(['agent-execute', 'memory-search']));
    expect(names).toHaveLength(9);

    // Pure shadowing: no tool denylist needed for remote sessions.
    expect(runtime.lastCreateOptions?.excludeTools).toBeUndefined();
  });

  it('ssh cwd: backend is disposed with the service', async () => {
    const runtime = await createRuntime(tmpDir);
    await runtime.testGetOrCreate('telegram:u1', { cwd: 'ssh user@h:/remote/x' });
    expect(runtime.lastBackend?.dispose).not.toHaveBeenCalled();
    runtime.dispose();
    expect(runtime.lastBackend?.dispose).toHaveBeenCalled();
  });

  it('subagent agent.execute inherits the parent cwd (including ssh specs)', async () => {
    const runtime = await createRuntime(tmpDir);
    const spec = 'ssh -i /k/key user@192.0.2.206:/remote/x';
    const tools = await runtime.testCustomTools('telegram:u1', undefined, spec);
    const execTool = tools.find(t => t.name === 'agent-execute');
    expect(execTool).toBeDefined();

    await execTool!.execute('tc1', { task: 'do a thing' }, undefined, undefined, undefined);

    const call = runtime.callLog.find(c => c.event === 'agent.execute');
    expect(call).toBeDefined();
    expect(call?.params.cwd).toBe(spec);
    expect(String(call?.params.sessionKey)).toMatch(/^telegram:u1:subagent:/);
  });

  it('explicit cwd wins over inherited cwd for subagents', async () => {
    const runtime = await createRuntime(tmpDir);
    const tools = await runtime.testCustomTools('telegram:u1', undefined, 'ssh u@h:/remote/x');
    const execTool = tools.find(t => t.name === 'agent-execute');

    await execTool!.execute('tc1', { task: 'do a thing', cwd: '/local/explicit' }, undefined, undefined, undefined);

    const call = runtime.callLog.find(c => c.event === 'agent.execute');
    expect(call?.params.cwd).toBe('/local/explicit');
  });
});
