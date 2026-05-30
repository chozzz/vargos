import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { AgentService } from '../index.js';
import { AppConfigSchema } from '../../config/index.js';
import type { Bus } from '../../../gateway/bus.js';
import { resetDataPaths } from '../../../lib/paths.js';
import { truncate } from '../../../lib/truncate.js';

// ── Helper methods testing ───────────────────────────────────────────────────

class TestableRuntime extends AgentService {
  testValidateModel(modelSpec: string): void {
    return this['validateModel'](modelSpec);
  }
}

function createTestRuntime(dataDir: string): TestableRuntime {
  const minimalConfig = AppConfigSchema.parse({
    providers: {
      test: {
        baseUrl: 'http://localhost:1234',
        apiKey: 'test-key',
        api: 'openai-completions',
        models: [
          { id: 'test-model', name: 'Test Model' },
          { id: 'valid-model', name: 'Valid Model' },
        ],
      },
    },
    agent: { model: 'test:test-model' },
  });

  resetDataPaths();
  process.env.VARGOS_DATA_DIR = dataDir;

  const runtime = new TestableRuntime({
    bus: { call: async () => ({}) } as unknown as Bus,
    config: minimalConfig,
  });

  return runtime;
}

describe('validateModel', () => {
  let tmpDir: string;
  let runtime: TestableRuntime;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.VARGOS_DATA_DIR;
    tmpDir = path.join(os.tmpdir(), `agent-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    runtime = createTestRuntime(tmpDir);
  });

  afterEach(() => {
    process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();
  });

  it('throws on invalid provider', () => {
    expect(() => {
      runtime.testValidateModel('nonexistent:model');
    }).toThrow('Model not found: nonexistent:model');
  });

  it('throws on invalid model id', () => {
    expect(() => {
      runtime.testValidateModel('test:nonexistent');
    }).toThrow('Model not found: test:nonexistent');
  });

  it('throws on malformed spec (missing colon)', () => {
    expect(() => {
      runtime.testValidateModel('invalid-spec');
    }).toThrow();
  });

  it('error message includes format hint', () => {
    expect(() => {
      runtime.testValidateModel('test:invalid');
    }).toThrow('Expected format: provider:modelId');
  });
});

describe('truncate', () => {
  it('returns content unchanged if under max chars', () => {
    const content = 'short text';
    const result = truncate(content, 100);
    expect(result).toBe(content);
  });

  it('truncates long content with head/tail strategy', () => {
    const longContent = 'a'.repeat(1000);
    const result = truncate(longContent, 100);
    expect(result).toContain('[...truncated...]');
    expect(result.length).toBeLessThan(longContent.length);
  });

  it('keeps 70% from head', () => {
    const longContent = 'abcdefghijklmnopqrstuvwxyz'.repeat(10);
    const result = truncate(longContent, 100);
    expect(result).toContain('a');
  });

  it('keeps 20% from tail', () => {
    const longContent = 'a'.repeat(100) + 'zzzzzzzzzzzzzzzzzzzz';
    const result = truncate(longContent, 100);
    expect(result).toContain('z');
  });

  it('handles empty content', () => {
    const result = truncate('', 100);
    expect(result).toBe('');
  });

  it('handles single character', () => {
    const result = truncate('a', 100);
    expect(result).toBe('a');
  });

  it('produces consistent output with same input', () => {
    const content = 'x'.repeat(1000);
    const result1 = truncate(content, 100);
    const result2 = truncate(content, 100);
    expect(result1).toBe(result2);
  });
});
