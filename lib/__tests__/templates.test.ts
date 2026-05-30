import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { resetDataPaths } from '../paths.js';
import { seedDataDir, collectTemplateConflicts } from '../templates.js';

describe('seedDataDir', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  const logger = {
    info: () => { },
    warn: () => { },
  };

  beforeEach(() => {
    originalEnv = process.env.VARGOS_DATA_DIR;
    tmpDir = path.join(os.tmpdir(), `templates-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env.VARGOS_DATA_DIR = tmpDir;
    resetDataPaths();
  });

  afterEach(() => {
    process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('copies missing files only — preserves existing user edits', async () => {
    const workspaceAgents = path.join(tmpDir, 'workspace', 'AGENTS.md');
    const cronHeartbeat = path.join(tmpDir, 'cron', 'heartbeat.md');

    mkdirSync(path.dirname(workspaceAgents), { recursive: true });
    mkdirSync(path.dirname(cronHeartbeat), { recursive: true });
    writeFileSync(workspaceAgents, 'local workspace edit', 'utf-8');
    writeFileSync(cronHeartbeat, 'local cron edit', 'utf-8');

    await seedDataDir(logger);

    // Seeding never overwrites — even AGENTS.md (updates are opt-in via `vargos sync`)
    expect(readFileSync(workspaceAgents, 'utf-8')).toBe('local workspace edit');
    expect(readFileSync(cronHeartbeat, 'utf-8')).toBe('local cron edit');
  });

  it('seeds files that do not exist in data dir', async () => {
    const workspaceSoul = path.join(tmpDir, 'workspace', 'SOUL.md');

    await seedDataDir(logger);

    // New file should be seeded
    expect(readFileSync(workspaceSoul, 'utf-8')).toContain('# SOUL.md');
  });

  it('reports overridable conflicts for AGENTS.md only, not user-owned files', async () => {
    await seedDataDir(logger); // seed defaults first
    const workspaceDir = path.join(tmpDir, 'workspace');

    // Diverge both AGENTS.md (overridable) and SOUL.md (user-owned)
    writeFileSync(path.join(workspaceDir, 'AGENTS.md'), 'edited agents', 'utf-8');
    writeFileSync(path.join(workspaceDir, 'SOUL.md'), 'edited soul', 'utf-8');

    const conflicts = await collectTemplateConflicts();
    const rels = conflicts.map(c => c.rel);

    expect(rels).toContain('workspace/AGENTS.md');
    expect(rels).not.toContain('workspace/SOUL.md');
  });
});
