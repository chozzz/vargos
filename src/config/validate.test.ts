import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateConfig, LOCAL_PROVIDERS } from './validate.js';
import type { VargosConfig, ModelProfile } from './pi-config.js';

function validConfig(overrides?: Partial<VargosConfig>): VargosConfig {
  return {
    models: { openai: { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test' } },
    agent: { primary: 'openai' },
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
      mcp: { transport: 'bad' as any, port: 0, endpoint: 'no-slash' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });

  it('agent.fallback referencing unknown profile produces warning', () => {
    const result = validateConfig({ ...validConfig(), agent: { primary: 'openai', fallback: 'missing' } });
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/fallback/)]));
  });
});

describe('LOCAL_PROVIDERS', () => {
  it('contains ollama and lmstudio', () => {
    expect(LOCAL_PROVIDERS.has('ollama')).toBe(true);
    expect(LOCAL_PROVIDERS.has('lmstudio')).toBe(true);
    expect(LOCAL_PROVIDERS.has('openai')).toBe(false);
  });
});
