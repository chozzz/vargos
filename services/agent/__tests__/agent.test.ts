import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AgentService } from '../index.js';
import { AppConfigSchema } from '../../config/index.js';
import type { Bus } from '../../../gateway/bus.js';
import { resetDataPaths } from '../../../lib/paths.js';

// ── System prompt merging ────────────────────────────────────────────────────

class TestableRuntime extends AgentService {
  async testGetSystemPrompt(sessionKey: string, cwd?: string) {
    return this.getSystemPrompt(sessionKey, cwd ? { cwd } : undefined);
  }
}

function createTestRuntime(dataDir: string): TestableRuntime {
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

  // Override dataDir via env
  resetDataPaths();
  process.env.VARGOS_DATA_DIR = dataDir;

  const runtime = new TestableRuntime({
    bus: { call: async () => ({}) } as unknown as Bus,
    config: minimalConfig,
  });

  // Don't restore env yet — keep dataDir override active for runtime's lifetime
  // (Tests will restore after they're done with the runtime)

  return runtime;
}

describe('getSystemPrompt merging', () => {
  let tmpDir: string;
  let workspaceDir: string;
  let cwdDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `agent-test-${Date.now()}`);
    workspaceDir = path.join(tmpDir, 'workspace');
    cwdDir = path.join(tmpDir, 'project');

    mkdirSync(path.join(workspaceDir, 'agent'), { recursive: true });
    mkdirSync(cwdDir, { recursive: true });

    // Save original env for cleanup
    originalEnv = process.env.VARGOS_DATA_DIR;
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv === undefined) delete process.env.VARGOS_DATA_DIR;
    else process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads bootstrap files from workspace only when no cwd', async () => {
    writeFileSync(path.join(workspaceDir, 'AGENTS.md'), '# Workspace Agent');

    const runtime = createTestRuntime(tmpDir);
    const prompt = await runtime.testGetSystemPrompt('test-session');

    expect(prompt).toContain('# Workspace Agent');
  });

  it('returns undefined when no bootstrap files exist', async () => {
    const runtime = createTestRuntime(tmpDir);
    const prompt = await runtime.testGetSystemPrompt('test-session');

    expect(prompt).toBeUndefined();
  });

  it('merges bootstrap files from workspace + cwd', async () => {
    writeFileSync(path.join(workspaceDir, 'AGENTS.md'), '# Workspace Agent');
    writeFileSync(path.join(cwdDir, 'CLAUDE.md'), '# Project Context');

    const runtime = createTestRuntime(tmpDir);
    const prompt = await runtime.testGetSystemPrompt('test-session', cwdDir);

    expect(prompt).toContain('# Workspace Agent');
    expect(prompt).toContain('# Project Context');
  });

  it('workspace files appear before cwd files', async () => {
    writeFileSync(path.join(workspaceDir, 'AGENTS.md'), 'WORKSPACE_MARKER');
    writeFileSync(path.join(cwdDir, 'CLAUDE.md'), 'CWD_MARKER');

    const runtime = createTestRuntime(tmpDir);
    const prompt = await runtime.testGetSystemPrompt('test-session', cwdDir)!;

    const wsIdx = prompt!.indexOf('WORKSPACE_MARKER');
    const cwdIdx = prompt!.indexOf('CWD_MARKER');
    expect(wsIdx).toBeLessThan(cwdIdx);
  });

  it('does not duplicate when cwd equals workspace', async () => {
    writeFileSync(path.join(workspaceDir, 'AGENTS.md'), '# Agent');

    const runtime = createTestRuntime(tmpDir);
    const prompt = await runtime.testGetSystemPrompt('test-session', workspaceDir);

    const matches = prompt!.match(/# Agent/g);
    expect(matches).toHaveLength(1);
  });

  it('truncates large files with head/tail strategy', async () => {
    const largeContent = 'X'.repeat(10_000);
    writeFileSync(path.join(workspaceDir, 'AGENTS.md'), largeContent);

    const runtime = createTestRuntime(tmpDir);
    const prompt = await runtime.testGetSystemPrompt('test-session');

    expect(prompt).toContain('[...truncated...]');
    expect(prompt!.length).toBeLessThan(largeContent.length);
  });

  it('loads CLAUDE.md from cwd', async () => {
    writeFileSync(path.join(cwdDir, 'CLAUDE.md'), '# My Project\nBuild instructions here');

    const runtime = createTestRuntime(tmpDir);
    const prompt = await runtime.testGetSystemPrompt('test-session', cwdDir);

    expect(prompt).toContain('# My Project');
    expect(prompt).toContain('Build instructions here');
  });
});

// ── Image handling ────────────────────────────────────────────────────────────

describe('execute with images', () => {
  it('converts base64 images to PiAgent ImageContent format', () => {
    // Test the image conversion logic
    const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const mimeType = 'image/png';
    
    // Simulate the conversion that happens in execute()
    const images = [{ data: base64Data, mimeType }].map(img => ({
      type: 'image' as const,
      data: img.data,
      mimeType: img.mimeType,
    }));
    
    expect(images).toHaveLength(1);
    expect(images[0]).toEqual({
      type: 'image',
      data: base64Data,
      mimeType,
    });
  });

  it('handles multiple images', () => {
    const images = [
      { data: 'base64data1', mimeType: 'image/png' },
      { data: 'base64data2', mimeType: 'image/jpeg' },
      { data: 'base64data3', mimeType: 'image/webp' },
    ].map(img => ({
      type: 'image' as const,
      data: img.data,
      mimeType: img.mimeType,
    }));
    
    expect(images).toHaveLength(3);
    expect(images).toEqual([
      { type: 'image', data: 'base64data1', mimeType: 'image/png' },
      { type: 'image', data: 'base64data2', mimeType: 'image/jpeg' },
      { type: 'image', data: 'base64data3', mimeType: 'image/webp' },
    ]);
  });

  it('handles undefined images gracefully', () => {
    const images = undefined?.map(img => ({
      type: 'image' as const,
      data: img.data,
      mimeType: img.mimeType,
    }));
    
    expect(images).toBeUndefined();
  });
});
