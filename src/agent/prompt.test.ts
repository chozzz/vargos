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

  it('returns minimal-subagent for subagent keys', () => {
    expect(resolvePromptMode('whatsapp:123:subagent:1708-x7k')).toBe('minimal-subagent');
    expect(resolvePromptMode('cli:chat:subagent:1708-abc')).toBe('minimal-subagent');
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

  it('returns minimal-subagent for nested subagents', () => {
    expect(resolvePromptMode('whatsapp:123:subagent:a:subagent:b')).toBe('minimal-subagent');
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
    it('includes Identity section delegating to SOUL.md', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
      });
      expect(result).toContain('## Identity');
      expect(result).toContain('SOUL.md');
      expect(result).not.toContain('You are Vargos');
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
      expect(result).toContain('All tools listed above are available');
    });

    it('includes mandatory media delivery block with channel and userId', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
        channel: 'whatsapp',
        sessionKey: 'whatsapp:61423222658',
      });
      expect(result).toContain('MEDIA DELIVERY (MANDATORY)');
      expect(result).toContain('channel_send_media');
      expect(result).toContain('channel="whatsapp"');
      expect(result).toContain('userId="61423222658"');
    });

    it('extracts userId from session key for channel prompt', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
        channel: 'telegram',
        sessionKey: 'telegram:98765',
      });
      expect(result).toContain('Channel: telegram, userId: 98765');
      expect(result).toContain('channel="telegram"');
      expect(result).toContain('userId="98765"');
    });

    it('handles subagent session key by extracting root userId', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
        channel: 'whatsapp',
        sessionKey: 'whatsapp:12345:subagent:abc',
      });
      expect(result).toContain('userId="12345"');
    });

    it('omits userId when sessionKey is not provided', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
        channel: 'whatsapp',
      });
      expect(result).toContain('MEDIA DELIVERY (MANDATORY)');
      expect(result).not.toContain('userId=');
      expect(result).not.toContain('Channel: whatsapp, userId:');
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

    it('includes Heartbeats section', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'minimal',
        workspaceDir: dir,
        toolNames: [],
      });
      expect(result).toContain('## Heartbeats');
    });
  });

  describe('orchestration', () => {
    it('includes Orchestration section in full mode', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
      });
      expect(result).toContain('## Orchestration');
      expect(result).toContain('Delegate via sessions_spawn');
    });

    it('includes focused worker section for subagent sessionKey', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
        sessionKey: 'whatsapp:123:subagent:abc',
      });
      expect(result).toContain('## Role: Focused Worker');
      expect(result).not.toContain('## Orchestration');
    });
  });

  describe('mode=minimal-subagent', () => {
    it('does NOT include Memory Recall or Heartbeats', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'minimal-subagent',
        workspaceDir: dir,
        toolNames: [],
      });
      expect(result).not.toContain('## Memory Recall');
      expect(result).not.toContain('## Heartbeats');
    });

    it('still includes Identity and Tooling', async () => {
      const dir = await makeTmpDir();
      const result = await buildSystemPrompt({
        mode: 'minimal-subagent',
        workspaceDir: dir,
        toolNames: ['exec'],
      });
      expect(result).toContain('## Identity');
      expect(result).toContain('## Tooling');
    });

    it('loads bootstrap files', async () => {
      const dir = await makeTmpDir();
      await fs.writeFile(path.join(dir, 'AGENTS.md'), '# Sub Agents');
      const result = await buildSystemPrompt({
        mode: 'minimal-subagent',
        workspaceDir: dir,
        toolNames: [],
      });
      expect(result).toContain('# Sub Agents');
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

    it('minimal mode loads bootstrap files', async () => {
      const dir = await makeTmpDir();
      await fs.writeFile(path.join(dir, 'AGENTS.md'), '# Agents OK');
      await fs.writeFile(path.join(dir, 'TOOLS.md'), '# Tools OK');
      await fs.writeFile(path.join(dir, 'SOUL.md'), '# Soul persona');

      const result = await buildSystemPrompt({
        mode: 'minimal',
        workspaceDir: dir,
        toolNames: [],
      });
      expect(result).toContain('# Agents OK');
      expect(result).toContain('# Tools OK');
      expect(result).toContain('# Soul persona');
    });

    it('does not inject USER.md, MEMORY.md, BOOTSTRAP.md, or HEARTBEAT.md', async () => {
      const dir = await makeTmpDir();
      await fs.writeFile(path.join(dir, 'AGENTS.md'), '# Agents');
      await fs.writeFile(path.join(dir, 'USER.md'), '# User prefs');
      await fs.writeFile(path.join(dir, 'MEMORY.md'), '# Memories');
      await fs.writeFile(path.join(dir, 'BOOTSTRAP.md'), '# Bootstrap');
      await fs.writeFile(path.join(dir, 'HEARTBEAT.md'), '# Heartbeat tasks');

      const result = await buildSystemPrompt({
        mode: 'full',
        workspaceDir: dir,
        toolNames: [],
      });
      expect(result).not.toContain('# User prefs');
      expect(result).not.toContain('# Memories');
      expect(result).not.toContain('# Bootstrap');
      expect(result).not.toContain('# Heartbeat tasks');
    });
  });
});
