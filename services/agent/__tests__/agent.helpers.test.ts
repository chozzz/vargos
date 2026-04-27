import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
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

  testBuildPromptContext(
    sessionKey: string,
    metadata?: Parameters<AgentService['getSystemPrompt']>[1],
  ): Record<string, string> {
    return this['buildPromptContext'](sessionKey, metadata);
  }

  testCollectBootstrapDirs(
    metadata?: Parameters<AgentService['getSystemPrompt']>[1],
  ): string[] {
    return this['collectBootstrapDirs'](metadata);
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
    tmpDir = path.join(os.tmpdir(), `agent-test-${Date.now()}`);
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

describe('buildPromptContext', () => {
  let tmpDir: string;
  let runtime: TestableRuntime;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.VARGOS_DATA_DIR;
    tmpDir = path.join(os.tmpdir(), `agent-test-${Date.now()}`);
    runtime = createTestRuntime(tmpDir);
  });

  afterEach(() => {
    process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();
  });

  it('extracts channel and user from sessionKey', () => {
    const context = runtime.testBuildPromptContext('telegram:user123');
    expect(context.CHANNEL_ID).toBe('telegram');
    expect(context.USER_ID).toBe('user123');
  });

  it('includes metadata channel type', () => {
    const context = runtime.testBuildPromptContext('telegram:user123', {
      channelType: 'telegram',
    });
    expect(context.CHANNEL_TYPE).toBe('telegram');
  });

  it('includes metadata from user', () => {
    const context = runtime.testBuildPromptContext('telegram:user123', {
      fromUser: 'Alice',
    });
    expect(context.FROM_USER).toBe('Alice');
  });

  it('includes metadata bot name', () => {
    const context = runtime.testBuildPromptContext('telegram:user123', {
      botName: 'MyBot',
    });
    expect(context.BOT_NAME).toBe('MyBot');
  });

  it('includes all metadata fields together', () => {
    const context = runtime.testBuildPromptContext('telegram:user123', {
      channelType: 'telegram',
      fromUser: 'Alice',
      botName: 'MyBot',
    });
    expect(context.CHANNEL_ID).toBe('telegram');
    expect(context.USER_ID).toBe('user123');
    expect(context.CHANNEL_TYPE).toBe('telegram');
    expect(context.FROM_USER).toBe('Alice');
    expect(context.BOT_NAME).toBe('MyBot');
  });

  it('omits undefined metadata fields', () => {
    const context = runtime.testBuildPromptContext('telegram:user123', {
      channelType: 'telegram',
    });
    expect(context).not.toHaveProperty('FROM_USER');
    expect(context).not.toHaveProperty('BOT_NAME');
  });

  it('handles missing metadata gracefully', () => {
    const context = runtime.testBuildPromptContext('telegram:user123');
    expect(context.CHANNEL_ID).toBe('telegram');
    expect(context.USER_ID).toBe('user123');
    expect(Object.keys(context)).toHaveLength(2);
  });
});

describe('collectBootstrapDirs', () => {
  let tmpDir: string;
  let runtime: TestableRuntime;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.VARGOS_DATA_DIR;
    tmpDir = path.join(os.tmpdir(), `agent-test-${Date.now()}`);
    mkdirSync(path.join(tmpDir, 'workspace'), { recursive: true });
    runtime = createTestRuntime(tmpDir);
  });

  afterEach(() => {
    process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('includes workspace dir', () => {
    const dirs = runtime.testCollectBootstrapDirs();
    expect(dirs.length).toBeGreaterThan(0);
    expect(dirs[0]).toContain('workspace');
  });

  it('adds cwd if different from workspace', () => {
    const customCwd = path.join(tmpDir, 'custom-dir');
    mkdirSync(customCwd, { recursive: true });
    const dirs = runtime.testCollectBootstrapDirs({ cwd: customCwd });
    expect(dirs.length).toBe(2);
    expect(dirs[1]).toBe(customCwd);
  });

  it('skips cwd if same as workspace', () => {
    const workspaceDir = path.join(tmpDir, 'workspace');
    const dirs = runtime.testCollectBootstrapDirs({ cwd: workspaceDir });
    expect(dirs.length).toBe(1);
  });

  it('normalizes paths before comparing', () => {
    const normalizedPath = path.join(tmpDir, 'workspace', '..', 'workspace');
    const dirs = runtime.testCollectBootstrapDirs({ cwd: normalizedPath });
    expect(dirs.length).toBe(1);
  });

  it('handles no cwd provided', () => {
    const dirs = runtime.testCollectBootstrapDirs();
    expect(dirs.length).toBe(1);
  });

  it('filters out non-existent dirs', () => {
    const missingCwd = path.join(tmpDir, 'does-not-exist');
    const dirs = runtime.testCollectBootstrapDirs({ cwd: missingCwd });
    expect(dirs).not.toContain(missingCwd);
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
