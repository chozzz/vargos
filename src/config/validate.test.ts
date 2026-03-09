import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateConfig, LOCAL_PROVIDERS } from './validate.js';
import type { VargosConfig, ModelProfile } from './pi-config.js';

function validConfig(overrides?: Partial<VargosConfig>): VargosConfig {
  return {
    models: { openai: { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test' } },
    agent: { primary: 'openai' },
    mcp: { bearerToken: 'test-token' },
    ...overrides,
  };
}

function withProfile(name: string, profile: ModelProfile, extra?: Partial<VargosConfig>): VargosConfig {
  return {
    models: { [name]: profile },
    agent: { primary: name },
    ...extra,
  };
}

describe('validateConfig', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = { OPENAI_API_KEY: process.env.OPENAI_API_KEY };
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('valid config returns no errors or warnings', () => {
    const result = validateConfig(validConfig());
    expect(result).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('empty models map is an error', () => {
    const result = validateConfig({ models: {}, agent: { primary: 'x' } } as VargosConfig);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/No model profiles/);
  });

  it('missing agent.primary is an error', () => {
    const result = validateConfig({ models: { a: { provider: 'openai', model: 'gpt-4o', apiKey: 'sk' } }, agent: { primary: '' } });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/agent\.primary/);
  });

  it('agent.primary referencing unknown profile is an error', () => {
    const result = validateConfig({ models: { a: { provider: 'openai', model: 'gpt-4o', apiKey: 'sk' } }, agent: { primary: 'missing' } });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/not found/)]));
  });

  it('missing profile provider is an error', () => {
    const result = validateConfig(withProfile('x', { provider: '', model: 'gpt-4o', apiKey: 'sk' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/provider/)]));
  });

  it('missing profile model is an error', () => {
    const result = validateConfig(withProfile('x', { provider: 'openai', model: '', apiKey: 'sk' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/model/)]));
  });

  it('cloud provider without API key or env var is an error', () => {
    const result = validateConfig(withProfile('x', { provider: 'openai', model: 'gpt-4o' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/API key/)]));
  });

  it('cloud provider with env var API key is valid', () => {
    process.env.OPENAI_API_KEY = 'sk-env';
    const result = validateConfig(withProfile('x', { provider: 'openai', model: 'gpt-4o' }));
    expect(result.valid).toBe(true);
  });

  it('local provider without API key is valid', () => {
    const result = validateConfig(withProfile('x', { provider: 'ollama', model: 'llama3' }));
    expect(result.valid).toBe(true);
  });

  it('local provider with invalid baseUrl is an error', () => {
    const result = validateConfig(withProfile('x', { provider: 'ollama', model: 'llama3', baseUrl: 'not-a-url' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/baseUrl/)]));
  });

  it('telegram channel without botToken produces warning', () => {
    const result = validateConfig({
      ...validConfig(),
      channels: { telegram: { enabled: true } },
    });
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/botToken/)]));
  });

  it('disabled telegram channel without botToken produces no warning', () => {
    const result = validateConfig({
      ...validConfig(),
      channels: { telegram: { enabled: false } },
    });
    expect(result.warnings).toHaveLength(0);
  });

  it('gateway.port out of range is an error', () => {
    const result = validateConfig({ ...validConfig(), gateway: { port: 99999 } });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/gateway\.port/)]));
  });

  it('gateway.port not integer is an error', () => {
    const result = validateConfig({ ...validConfig(), gateway: { port: 80.5 } });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/gateway\.port/)]));
  });

  it('mcp.transport invalid is an error', () => {
    const result = validateConfig({ ...validConfig(), mcp: { transport: 'grpc' as any } });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/mcp\.transport/)]));
  });

  it('mcp.port out of range is an error', () => {
    const result = validateConfig({ ...validConfig(), mcp: { port: 0 } });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/mcp\.port/)]));
  });

  it('mcp.endpoint not starting with / is an error', () => {
    const result = validateConfig({ ...validConfig(), mcp: { endpoint: 'mcp' } });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/mcp\.endpoint/)]));
  });

  it('multiple errors accumulate', () => {
    const result = validateConfig({
      models: { x: { provider: '', model: '' } },
      agent: { primary: 'x' },
      gateway: { port: -1 },
      mcp: { transport: 'bad' as any, port: 0, endpoint: 'no-slash', bearerToken: 'x' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });

  it('warns when mcp.bearerToken is missing', () => {
    const result = validateConfig({ ...validConfig(), mcp: {} });
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/bearerToken/)]));
  });

  it('no mcp warning when mcp section is absent', () => {
    const result = validateConfig({ ...validConfig(), mcp: undefined });
    expect(result.valid).toBe(true);
    expect(result.warnings).not.toEqual(expect.arrayContaining([expect.stringMatching(/bearerToken/)]));
  });

  it('no mcp warning when bearerToken is set', () => {
    const result = validateConfig({ ...validConfig(), mcp: { bearerToken: 'my-secret' } });
    expect(result.warnings).not.toEqual(expect.arrayContaining([expect.stringMatching(/bearerToken/)]));
  });

  it('no mcp warning when transport is stdio', () => {
    const result = validateConfig({ ...validConfig(), mcp: { transport: 'stdio' } });
    expect(result.warnings).not.toEqual(expect.arrayContaining([expect.stringMatching(/bearerToken/)]));
  });

  it('agent.fallback referencing unknown profile produces warning', () => {
    const result = validateConfig({ ...validConfig(), agent: { primary: 'openai', fallback: 'missing' } });
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/fallback/)]));
  });

  it('agent.media referencing unknown profile produces warning', () => {
    const result = validateConfig({ ...validConfig(), agent: { primary: 'openai', media: { audio: 'missing' } } });
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/agent\.media\.audio.*missing/)]));
  });

  it('agent.media referencing valid profile produces no warning', () => {
    const result = validateConfig({
      models: {
        openai: { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test' },
        whisper: { provider: 'openai', model: 'whisper-1', apiKey: 'sk-test' },
      },
      agent: { primary: 'openai', media: { audio: 'whisper' } },
      mcp: { bearerToken: 'test-token' },
    });
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('agent.media with multiple invalid entries produces multiple warnings', () => {
    const result = validateConfig({
      ...validConfig(),
      agent: { primary: 'openai', media: { audio: 'missing-a', image: 'missing-b' } },
    });
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toMatch(/agent\.media\.audio/);
    expect(result.warnings[1]).toMatch(/agent\.media\.image/);
  });
});

describe('subagent config validation', () => {
  it('accepts valid subagent config', () => {
    const config = validConfig();
    config.agent.subagents = { maxChildren: 10, maxSpawnDepth: 3, runTimeoutSeconds: 300 };
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects maxChildren outside 1-50', () => {
    const config = validConfig();
    config.agent.subagents = { maxChildren: 0 };
    expect(validateConfig(config).errors).toContain('agent.subagents.maxChildren must be an integer 1-50');

    config.agent.subagents = { maxChildren: 51 };
    expect(validateConfig(config).errors).toContain('agent.subagents.maxChildren must be an integer 1-50');
  });

  it('rejects maxSpawnDepth outside 1-5', () => {
    const config = validConfig();
    config.agent.subagents = { maxSpawnDepth: 0 };
    expect(validateConfig(config).errors).toContain('agent.subagents.maxSpawnDepth must be an integer 1-5');

    config.agent.subagents = { maxSpawnDepth: 6 };
    expect(validateConfig(config).errors).toContain('agent.subagents.maxSpawnDepth must be an integer 1-5');
  });

  it('rejects negative runTimeoutSeconds', () => {
    const config = validConfig();
    config.agent.subagents = { runTimeoutSeconds: -1 };
    expect(validateConfig(config).errors).toContain('agent.subagents.runTimeoutSeconds must be a non-negative number');
  });

  it('warns on missing subagent model profile', () => {
    const config = validConfig();
    config.agent.subagents = { model: 'nonexistent' };
    const result = validateConfig(config);
    expect(result.warnings).toContain('agent.subagents.model "nonexistent" not found in models');
  });

  it('warns when embedding provider is openai without API key', () => {
    const result = validateConfig(validConfig({
      embedding: { provider: 'openai' },
    }));
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('embedding') && w.includes('API key'))).toBe(true);
  });

  it('no embedding warning when apiKey is set', () => {
    const result = validateConfig(validConfig({
      embedding: { provider: 'openai', apiKey: 'sk-test' },
    }));
    expect(result.warnings.some(w => w.includes('embedding'))).toBe(false);
  });

  it('no embedding warning when provider is local or none', () => {
    const resultLocal = validateConfig(validConfig({ embedding: { provider: 'local' } }));
    const resultNone = validateConfig(validConfig({ embedding: { provider: 'none' } }));
    expect(resultLocal.warnings.some(w => w.includes('embedding'))).toBe(false);
    expect(resultNone.warnings.some(w => w.includes('embedding'))).toBe(false);
  });
});

describe('LOCAL_PROVIDERS', () => {
  it('contains ollama and lmstudio', () => {
    expect(LOCAL_PROVIDERS.has('ollama')).toBe(true);
    expect(LOCAL_PROVIDERS.has('lmstudio')).toBe(true);
    expect(LOCAL_PROVIDERS.has('openai')).toBe(false);
  });
});
