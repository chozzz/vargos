import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AgentService } from '../index.js';
import { AppConfigSchema } from '../../config/index.js';
import type { Bus } from '../../../gateway/bus.js';
import { resetDataPaths } from '../../../lib/paths.js';
import type {
  AgentSession,
  CreateAgentSessionOptions,
  CreateAgentSessionResult,
} from '@earendil-works/pi-coding-agent';

// ── Fakes ──────────────────────────────────────────────────────────────────

interface FakeModel { provider: string; id: string; }

function fakeSession(model?: FakeModel) {
  const session = {
    model,
    setModel: vi.fn(async (m: FakeModel) => { session.model = m; }),
    subscribe: vi.fn(),
    systemPrompt: '',
    state: { messages: [] },
    dispose: vi.fn(),
  };
  return session as unknown as AgentSession & { setModel: ReturnType<typeof vi.fn> };
}

// Two test models so overrides have something distinct to switch to.
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

class TestableRuntime extends AgentService {
  lastCreateOptions?: CreateAgentSessionOptions;
  fakeForCreate = fakeSession({ provider: 'test', id: 'model-a' });

  protected createPiSession(options: CreateAgentSessionOptions): Promise<CreateAgentSessionResult> {
    this.lastCreateOptions = options;
    return Promise.resolve({ session: this.fakeForCreate } as unknown as CreateAgentSessionResult);
  }

  testGetOrCreate(key: string, opts?: { cwd?: string; model?: string }) {
    return this.getOrCreateSession(key, opts);
  }

  inject(key: string, session: AgentSession) {
    this.sessions.set(key, session);
    this.sessionMeta.set(key, Date.now());
  }
}

function createRuntime(dataDir: string): TestableRuntime {
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

  resetDataPaths();
  process.env.VARGOS_DATA_DIR = dataDir;

  const bus = {
    call: async (event: string) => (event === 'bus.search' ? [] : {}),
  } as unknown as Bus;

  return new TestableRuntime({ bus, config });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('agent model override', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `model-override-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

  it('applies the override when creating a new session', async () => {
    const runtime = createRuntime(tmpDir);
    runtime.fakeForCreate = fakeSession({ provider: 'test', id: 'model-b' });

    await runtime.testGetOrCreate('telegram:u1', { model: 'test:model-b' });

    expect(runtime.lastCreateOptions?.model).toMatchObject({ provider: 'test', id: 'model-b' });
  });

  it('switches the model on a cached session', async () => {
    const runtime = createRuntime(tmpDir);
    const cached = fakeSession({ provider: 'test', id: 'model-a' });
    runtime.inject('telegram:u1', cached);

    const returned = await runtime.testGetOrCreate('telegram:u1', { model: 'test:model-b' });

    expect((cached as unknown as { setModel: ReturnType<typeof vi.fn> }).setModel)
      .toHaveBeenCalledWith(expect.objectContaining({ provider: 'test', id: 'model-b' }));
    expect(returned.model).toMatchObject({ provider: 'test', id: 'model-b' });
  });

  it('is a no-op when the override matches the cached model', async () => {
    const runtime = createRuntime(tmpDir);
    const cached = fakeSession({ provider: 'test', id: 'model-a' });
    runtime.inject('telegram:u1', cached);

    await runtime.testGetOrCreate('telegram:u1', { model: 'test:model-a' });

    expect((cached as unknown as { setModel: ReturnType<typeof vi.fn> }).setModel).not.toHaveBeenCalled();
  });

  it('does not touch the model on a cached session when no override is given', async () => {
    const runtime = createRuntime(tmpDir);
    const cached = fakeSession({ provider: 'test', id: 'model-a' });
    runtime.inject('telegram:u1', cached);

    await runtime.testGetOrCreate('telegram:u1');

    expect((cached as unknown as { setModel: ReturnType<typeof vi.fn> }).setModel).not.toHaveBeenCalled();
  });

  it('omits the model option entirely when no override is given on creation', async () => {
    const runtime = createRuntime(tmpDir);

    await runtime.testGetOrCreate('telegram:u3');

    expect(runtime.lastCreateOptions).toBeDefined();
    expect('model' in runtime.lastCreateOptions!).toBe(false);
  });

  it('keeps the default model when the override is unknown', async () => {
    const runtime = createRuntime(tmpDir);
    const cached = fakeSession({ provider: 'test', id: 'model-a' });
    runtime.inject('telegram:u1', cached);

    const returned = await runtime.testGetOrCreate('telegram:u1', { model: 'bogus:nope' });

    expect((cached as unknown as { setModel: ReturnType<typeof vi.fn> }).setModel).not.toHaveBeenCalled();
    expect(returned.model).toMatchObject({ provider: 'test', id: 'model-a' });
  });

  it('honors the cwd override on a cache miss', async () => {
    const runtime = createRuntime(tmpDir);
    const cwd = path.join(tmpDir, 'project');
    mkdirSync(cwd, { recursive: true });

    await runtime.testGetOrCreate('telegram:u2', { cwd });

    expect(runtime.lastCreateOptions?.cwd).toBe(cwd);
  });
});
