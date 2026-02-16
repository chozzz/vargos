import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateConfig, LOCAL_PROVIDERS } from './validate.js';
import type { VargosConfig } from './pi-config.js';

function validConfig(overrides?: Partial<VargosConfig>): VargosConfig {
  return {
    agent: { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test' },
    ...overrides,
  };
}

describe('validateConfig', () => {
  // Save/restore env so API key env fallback tests are isolated
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

  it('missing agent section is an error', () => {
    const result = validateConfig({} as VargosConfig);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Missing "agent" section/);
  });

  it('missing agent.provider is an error', () => {
    const result = validateConfig({ agent: { provider: '', model: 'gpt-4o', apiKey: 'sk' } });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/provider/)]));
  });

  it('missing agent.model is an error', () => {
    const result = validateConfig({ agent: { provider: 'openai', model: '', apiKey: 'sk' } });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/model/)]));
  });

  it('cloud provider without API key or env var is an error', () => {
    const result = validateConfig({ agent: { provider: 'openai', model: 'gpt-4o' } });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/API key/)]));
  });

  it('cloud provider with env var API key is valid', () => {
    process.env.OPENAI_API_KEY = 'sk-env';
    const result = validateConfig({ agent: { provider: 'openai', model: 'gpt-4o' } });
    expect(result.valid).toBe(true);
  });

  it('local provider without API key is valid', () => {
    const result = validateConfig({ agent: { provider: 'ollama', model: 'llama3' } });
    expect(result.valid).toBe(true);
  });

  it('local provider with invalid baseUrl is an error', () => {
    const result = validateConfig({
      agent: { provider: 'ollama', model: 'llama3', baseUrl: 'not-a-url' },
    });
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
    const cfg = { ...validConfig(), mcp: { transport: 'grpc' as any } };
    const result = validateConfig(cfg);
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
      agent: { provider: '', model: '' },
      gateway: { port: -1 },
      mcp: { transport: 'bad' as any, port: 0, endpoint: 'no-slash' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });
});

describe('LOCAL_PROVIDERS', () => {
  it('contains ollama and lmstudio', () => {
    expect(LOCAL_PROVIDERS.has('ollama')).toBe(true);
    expect(LOCAL_PROVIDERS.has('lmstudio')).toBe(true);
    expect(LOCAL_PROVIDERS.has('openai')).toBe(false);
  });
});
