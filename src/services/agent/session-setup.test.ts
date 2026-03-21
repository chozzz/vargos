import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildPiSession } from './session-setup.js';

describe('buildPiSession', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-session-setup-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('uses provided systemPrompt as the base system prompt', async () => {
    const customPrompt = 'You are a test agent. Use tools freely.';
    const { session } = await buildPiSession({
      workspaceDir: tmpDir,
      sessionKey: 'test:prompt',
      systemPrompt: customPrompt,
    });

    // SDK appends date/time and cwd, so check our prompt is the prefix
    expect(session.systemPrompt).toContain(customPrompt);
    // Must NOT contain the SDK's default boilerplate
    expect(session.systemPrompt).not.toContain('expert coding assistant operating inside pi');
  });

  it('suppresses ancestor CLAUDE.md and AGENTS.md loading', async () => {
    // Create files the SDK would normally discover via ancestor walk
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# Agents\nShould not appear.');
    await fs.writeFile(path.join(tmpDir, 'CLAUDE.md'), '# Claude\nShould not appear.');

    const customPrompt = 'Custom prompt.';
    const { session } = await buildPiSession({
      workspaceDir: tmpDir,
      sessionKey: 'test:no-dupe',
      systemPrompt: customPrompt,
    });

    // SDK injects ancestor files under "# Project Context" — must be suppressed
    expect(session.systemPrompt).not.toContain('# Project Context');
    expect(session.systemPrompt).not.toContain('Project-specific instructions');
  });

  it('falls back to SDK default prompt when systemPrompt is omitted', async () => {
    const { session } = await buildPiSession({
      workspaceDir: tmpDir,
      sessionKey: 'test:default',
    });

    // Without our prompt, SDK builds its own
    expect(session.systemPrompt).toContain('expert coding assistant');
  });

  it('preserves systemPrompt for subagent session keys', async () => {
    const subagentPrompt = 'You are a focused worker. Complete the task directly.';
    const { session } = await buildPiSession({
      workspaceDir: tmpDir,
      sessionKey: 'cli:chat:subagent:abc123',
      systemPrompt: subagentPrompt,
    });

    expect(session.systemPrompt).toContain(subagentPrompt);
    expect(session.systemPrompt).not.toContain('expert coding assistant');
  });

  it('prompt survives SDK reset (simulates emitBeforeAgentStart)', async () => {
    const customPrompt = 'Vargos-owned system prompt content.';
    const { session } = await buildPiSession({
      workspaceDir: tmpDir,
      sessionKey: 'test:reset',
      systemPrompt: customPrompt,
    });

    // Access the internal _baseSystemPrompt via the public getter
    // The SDK resets to _baseSystemPrompt on every prompt() call,
    // so our prompt must BE the base system prompt, not just agent.state
    const basePrompt = session.systemPrompt;
    expect(basePrompt).toContain(customPrompt);

    // Simulate what the SDK does: set to base, then read back
    session.agent.setSystemPrompt(basePrompt);
    expect(session.systemPrompt).toContain(customPrompt);
  });
});
