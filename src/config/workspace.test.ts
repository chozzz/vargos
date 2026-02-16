import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  CONTEXT_FILE_NAMES,
  loadContextFiles,
  initializeWorkspace,
  isWorkspaceInitialized,
} from './workspace.js';

const tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-ws-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  tmpDirs.length = 0;
});

describe('CONTEXT_FILE_NAMES', () => {
  it('has 7 entries', () => {
    expect(CONTEXT_FILE_NAMES).toHaveLength(7);
  });
});

describe('loadContextFiles', () => {
  it('returns empty array for nonexistent dir', async () => {
    const result = await loadContextFiles('/tmp/does-not-exist-' + Date.now());
    expect(result).toEqual([]);
  });

  it('loads existing files and skips missing ones', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, 'AGENTS.md'), 'agents content');
    await fs.writeFile(path.join(dir, 'SOUL.md'), 'soul content');

    const result = await loadContextFiles(dir);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'AGENTS.md', content: 'agents content' });
    expect(result[1]).toEqual({ name: 'SOUL.md', content: 'soul content' });
  });
});

describe('initializeWorkspace', () => {
  it('creates all default files', async () => {
    const dir = await makeTmpDir();
    const ws = path.join(dir, 'workspace');
    await initializeWorkspace({ workspaceDir: ws });

    for (const name of CONTEXT_FILE_NAMES) {
      const stat = await fs.stat(path.join(ws, name));
      expect(stat.isFile()).toBe(true);
    }
  });

  it('creates memory/ subdirectory', async () => {
    const dir = await makeTmpDir();
    const ws = path.join(dir, 'workspace');
    await initializeWorkspace({ workspaceDir: ws });

    const stat = await fs.stat(path.join(ws, 'memory'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('skipIfExists=true preserves existing files', async () => {
    const dir = await makeTmpDir();
    const ws = path.join(dir, 'workspace');
    await fs.mkdir(ws, { recursive: true });
    await fs.writeFile(path.join(ws, 'AGENTS.md'), 'custom');

    await initializeWorkspace({ workspaceDir: ws, skipIfExists: true });

    const content = await fs.readFile(path.join(ws, 'AGENTS.md'), 'utf-8');
    expect(content).toBe('custom');
  });

  it('skipIfExists=false overwrites existing files', async () => {
    const dir = await makeTmpDir();
    const ws = path.join(dir, 'workspace');
    await fs.mkdir(ws, { recursive: true });
    await fs.writeFile(path.join(ws, 'AGENTS.md'), 'custom');

    await initializeWorkspace({ workspaceDir: ws, skipIfExists: false });

    const content = await fs.readFile(path.join(ws, 'AGENTS.md'), 'utf-8');
    expect(content).not.toBe('custom');
    expect(content).toContain('AGENTS.md');
  });
});

describe('isWorkspaceInitialized', () => {
  it('returns false for empty dir', async () => {
    const dir = await makeTmpDir();
    expect(await isWorkspaceInitialized(dir)).toBe(false);
  });

  it('returns true when AGENTS.md and TOOLS.md exist', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '');
    await fs.writeFile(path.join(dir, 'TOOLS.md'), '');
    expect(await isWorkspaceInitialized(dir)).toBe(true);
  });

  it('returns false when only one required file exists', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '');
    expect(await isWorkspaceInitialized(dir)).toBe(false);
  });
});
