import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildSystemPrompt, resolvePromptMode } from './prompt.js';

let tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-prompt-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

// ---- resolvePromptMode ----

describe('resolvePromptMode', () => {
  it('returns full for regular chat sessions', () => {
    expect(resolvePromptMode('chat:main')).toBe('full');
  });

  it('returns full for subagent keys', () => {
    expect(resolvePromptMode('whatsapp:123:subagent:1708-x7k')).toBe('full');
    expect(resolvePromptMode('cli:chat:subagent:1708-abc')).toBe('full');
  });

  it('returns minimal for cron: prefix', () => {
    expect(resolvePromptMode('cron:daily')).toBe('minimal');
  });

  it('returns minimal for cron subagent sessions', () => {
    expect(resolvePromptMode('cron:daily:subagent:abc')).toBe('minimal');
  });

  it('returns full for channel sessions', () => {
    expect(resolvePromptMode('telegram:user')).toBe('full');
  });
});

// ---- buildSystemPrompt ----

describe('buildSystemPrompt', () => {
  it('mode=none returns fallback string', async () => {
    const dir = await makeTmpDir();
    const result = await buildSystemPrompt({
      mode: 'none',
      workspaceDir: dir,
      toolNames: [],
    });
    expect(result).toBe('You are a helpful assistant.');
  });

  describe('mode=full', () => {
    it('includes Identity section', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
      });
      expect(result).toContain('## Identity');
    });

    it('includes Tooling section with tool names', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: ['read', 'exec'],
      });
      expect(result).toContain('## Tooling');
      expect(result).toContain('- read:');
      expect(result).toContain('- exec:');
    });

    it('includes Workspace section with path', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
      });
      expect(result).toContain('## Workspace');
      expect(result).toContain(dir);
    });

    it('includes Memory Recall section', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
      });
      expect(result).toContain('## Memory Recall');
    });

    it('includes Heartbeats section', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
      });
      expect(result).toContain('## Heartbeats');
    });

    it('includes Channel section with behavioral rules when channel is set', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
        channel: 'whatsapp',
      });
      expect(result).toContain('## Channel');
      expect(result).toContain('whatsapp');
      expect(result).toContain('Execute tools immediately');
      expect(result).toContain('All tools listed in ## Tooling above are available');
    });

    it('includes system section with date, time, and OS', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
        userTimezone: 'Asia/Tokyo',
      });
      expect(result).toContain('## System');
      expect(result).toContain('Asia/Tokyo');
      expect(result).toContain('Date:');
      expect(result).toContain(`OS: ${process.platform}`);
    });

    it('includes model in runtime section', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
        model: 'claude-sonnet-4-20250514',
      });
      expect(result).toContain('model=claude-sonnet-4-20250514');
    });

    it('includes Additional Context when extraSystemPrompt is set', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
        extraSystemPrompt: 'Always respond in Spanish.',
      });
      expect(result).toContain('## Additional Context');
      expect(result).toContain('Always respond in Spanish.');
    });
  });

  describe('mode=minimal', () => {
    it('does NOT include Memory Recall', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'minimal',
        workspaceDir: dir,
        toolNames: [],
      });
      expect(result).not.toContain('## Memory Recall');
    });

    it('does NOT include Heartbeats', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'minimal',
        workspaceDir: dir,
        toolNames: [],
      });
      expect(result).not.toContain('## Heartbeats');
    });
  });

  describe('bootstrap file loading', () => {
    it('loads AGENTS.md and TOOLS.md content', async () => {
      const dir = await makeTmpDir();
      await fs.writeFile(path.join(dir, 'AGENTS.md'), '# Test Agents');
      await fs.writeFile(path.join(dir, 'TOOLS.md'), '# Test Tools');

      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
      });
      expect(result).toContain('# Test Agents');
      expect(result).toContain('# Test Tools');
    });

    it('truncates files exceeding 20000 chars', async () => {
      const dir = await makeTmpDir();
      const bigContent = 'A'.repeat(25000);
      await fs.writeFile(path.join(dir, 'AGENTS.md'), bigContent);

      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
      });
      expect(result).toContain('[...truncated, read AGENTS.md for full content...]');
    });

    it('minimal mode loads all bootstrap files', async () => {
      const dir = await makeTmpDir();
      await fs.writeFile(path.join(dir, 'AGENTS.md'), '# Agents OK');
      await fs.writeFile(path.join(dir, 'TOOLS.md'), '# Tools OK');
      await fs.writeFile(path.join(dir, 'SOUL.md'), '# Soul persona');
      await fs.writeFile(path.join(dir, 'USER.md'), '# User prefs');

      const result = await buildSystemPrompt({
        mode: 'minimal',
        workspaceDir: dir,
        toolNames: [],
      });
      expect(result).toContain('# Agents OK');
      expect(result).toContain('# Tools OK');
      expect(result).toContain('# Soul persona');
      expect(result).toContain('# User prefs');
    });
  });
});
