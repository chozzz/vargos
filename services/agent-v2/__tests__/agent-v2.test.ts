import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseModelRef, AgentRuntime } from '../index.js';
import { AppConfigSchema } from '../../config/index.js';
import type { Bus } from '../../../gateway/bus.js';

// ── parseModelRef ────────────────────────────────────────────────────────────

describe('parseModelRef', () => {
  it('splits provider:modelId', () => {
    expect(parseModelRef('openrouter:minimax/minimax-m2.7')).toEqual({
      provider: 'openrouter',
      modelId: 'minimax/minimax-m2.7',
    });
  });

  it('handles simple modelId without slashes', () => {
    expect(parseModelRef('openai:gpt-4o-mini')).toEqual({
      provider: 'openai',
      modelId: 'gpt-4o-mini',
    });
  });

  it('splits on first colon only', () => {
    expect(parseModelRef('custom:some:model:id')).toEqual({
      provider: 'custom',
      modelId: 'some:model:id',
    });
  });

  it('throws on missing colon', () => {
    expect(() => parseModelRef('no-colon')).toThrow('Invalid model ref');
  });

  it('throws on empty string', () => {
    expect(() => parseModelRef('')).toThrow('Invalid model ref');
  });
});

// ── System prompt merging ────────────────────────────────────────────────────

class TestableRuntime extends AgentRuntime {
  async testGetSystemPrompt(sessionKey: string, cwd?: string) {
    return this.getSystemPrompt(sessionKey, cwd);
  }
}

function createTestRuntime(workspaceDir: string): TestableRuntime {
  const minimalConfig = AppConfigSchema.parse({
    providers: {
      test: {
        baseUrl: 'http://localhost:1234',
        apiKey: 'test-key',
        api: 'openai-completions',
        models: [{ id: 'test-model', name: 'Test Model' }],
      },
    },
    agent: { model: 'test:test-model' },
  });

  // Override workspaceDir via env
  const originalEnv = process.env.VARGOS_WORKSPACE_DIR;
  process.env.VARGOS_WORKSPACE_DIR = workspaceDir;

  const runtime = new TestableRuntime({
    bus: { call: async () => ({}) } as unknown as Bus,
    config: minimalConfig,
  });

  // Restore env
  if (originalEnv === undefined) delete process.env.VARGOS_WORKSPACE_DIR;
  else process.env.VARGOS_WORKSPACE_DIR = originalEnv;

  return runtime;
}

describe('getSystemPrompt merging', () => {
  let tmpDir: string;
  let workspaceDir: string;
  let cwdDir: string;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `agent-v2-test-${Date.now()}`);
    workspaceDir = path.join(tmpDir, 'workspace');
    cwdDir = path.join(tmpDir, 'project');

    mkdirSync(path.join(workspaceDir, 'agent'), { recursive: true });
    mkdirSync(cwdDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads bootstrap files from workspace only when no cwd', async () => {
    writeFileSync(path.join(workspaceDir, 'AGENTS.md'), '# Workspace Agent');

    const runtime = createTestRuntime(workspaceDir);
    const prompt = await runtime.testGetSystemPrompt('test-session');

    expect(prompt).toContain('# Workspace Agent');
  });

  it('returns undefined when no bootstrap files exist', async () => {
    const runtime = createTestRuntime(workspaceDir);
    const prompt = await runtime.testGetSystemPrompt('test-session');

    expect(prompt).toBeUndefined();
  });

  it('merges bootstrap files from workspace + cwd', async () => {
    writeFileSync(path.join(workspaceDir, 'AGENTS.md'), '# Workspace Agent');
    writeFileSync(path.join(cwdDir, 'CLAUDE.md'), '# Project Context');

    const runtime = createTestRuntime(workspaceDir);
    const prompt = await runtime.testGetSystemPrompt('test-session', cwdDir);

    expect(prompt).toContain('# Workspace Agent');
    expect(prompt).toContain('# Project Context');
  });

  it('workspace files appear before cwd files', async () => {
    writeFileSync(path.join(workspaceDir, 'AGENTS.md'), 'WORKSPACE_MARKER');
    writeFileSync(path.join(cwdDir, 'CLAUDE.md'), 'CWD_MARKER');

    const runtime = createTestRuntime(workspaceDir);
    const prompt = await runtime.testGetSystemPrompt('test-session', cwdDir)!;

    const wsIdx = prompt!.indexOf('WORKSPACE_MARKER');
    const cwdIdx = prompt!.indexOf('CWD_MARKER');
    expect(wsIdx).toBeLessThan(cwdIdx);
  });

  it('does not duplicate when cwd equals workspace', async () => {
    writeFileSync(path.join(workspaceDir, 'AGENTS.md'), '# Agent');

    const runtime = createTestRuntime(workspaceDir);
    const prompt = await runtime.testGetSystemPrompt('test-session', workspaceDir);

    const matches = prompt!.match(/# Agent/g);
    expect(matches).toHaveLength(1);
  });

  it('truncates large files with head/tail strategy', async () => {
    const largeContent = 'X'.repeat(10_000);
    writeFileSync(path.join(workspaceDir, 'AGENTS.md'), largeContent);

    const runtime = createTestRuntime(workspaceDir);
    const prompt = await runtime.testGetSystemPrompt('test-session');

    expect(prompt).toContain('[...truncated...]');
    expect(prompt!.length).toBeLessThan(largeContent.length);
  });

  it('loads CLAUDE.md from cwd', async () => {
    writeFileSync(path.join(cwdDir, 'CLAUDE.md'), '# My Project\nBuild instructions here');

    const runtime = createTestRuntime(workspaceDir);
    const prompt = await runtime.testGetSystemPrompt('test-session', cwdDir);

    expect(prompt).toContain('# My Project');
    expect(prompt).toContain('Build instructions here');
  });
});
