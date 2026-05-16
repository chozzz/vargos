import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { resetDataPaths } from '../paths.js';
import { seedDataDir } from '../templates.js';

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

  it('refreshes workspace markdown while preserving existing files elsewhere', async () => {
    const workspaceAgents = path.join(tmpDir, 'workspace', 'AGENTS.md');
    const cronHeartbeat = path.join(tmpDir, 'cron', 'heartbeat.md');

    mkdirSync(path.dirname(workspaceAgents), { recursive: true });
    mkdirSync(path.dirname(cronHeartbeat), { recursive: true });
    writeFileSync(workspaceAgents, 'local workspace edit', 'utf-8');
    writeFileSync(cronHeartbeat, 'local cron edit', 'utf-8');

    await seedDataDir(logger);

    expect(readFileSync(workspaceAgents, 'utf-8')).not.toBe('local workspace edit');
    expect(readFileSync(workspaceAgents, 'utf-8')).toContain('## Self-Awareness');
    expect(readFileSync(cronHeartbeat, 'utf-8')).toBe('local cron edit');
  });
});
