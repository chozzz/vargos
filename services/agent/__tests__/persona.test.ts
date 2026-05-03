import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { resetDataPaths } from '../../../lib/paths.js';
import { loadChannelPersona, expandToolGlobs, ensureChannelPersonaFiles, PI_BUILTIN_TOOLS } from '../persona.js';

const AVAILABLE = [...PI_BUILTIN_TOOLS, 'memory.search', 'memory.read', 'memory.write', 'channel.send', 'mcp.atlassian.create_issue', 'mcp.atlassian.search'];

describe('expandToolGlobs', () => {
  it('expands * wildcard against tool list', () => {
    expect(expandToolGlobs(['memory.*'], AVAILABLE).sort()).toEqual(['memory.read', 'memory.search', 'memory.write']);
  });

  it('matches exact names without wildcard', () => {
    expect(expandToolGlobs(['channel.send'], AVAILABLE)).toEqual(['channel.send']);
  });

  it('drops exact names not in the available list', () => {
    expect(expandToolGlobs(['nonexistent'], AVAILABLE)).toEqual([]);
  });

  it('combines patterns and de-duplicates', () => {
    const out = expandToolGlobs(['memory.read', 'memory.*', 'channel.send'], AVAILABLE).sort();
    expect(out).toEqual(['channel.send', 'memory.read', 'memory.search', 'memory.write']);
  });

  it('matches namespace prefix with .*', () => {
    expect(expandToolGlobs(['mcp.atlassian.*'], AVAILABLE).sort()).toEqual(['mcp.atlassian.create_issue', 'mcp.atlassian.search']);
  });

  it('lone * matches everything', () => {
    expect(expandToolGlobs(['*'], AVAILABLE).sort()).toEqual([...AVAILABLE].sort());
  });
});

describe('loadChannelPersona', () => {
  let tmpDir: string;
  let agentsDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `persona-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    agentsDir = path.join(tmpDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    originalEnv = process.env.VARGOS_DATA_DIR;
    process.env.VARGOS_DATA_DIR = tmpDir;
    resetDataPaths();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.VARGOS_DATA_DIR;
    else process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when persona file missing', async () => {
    const result = await loadChannelPersona('telegram-foo', AVAILABLE);
    expect(result).toBeNull();
  });

  it('warns and returns null when frontmatter has no overrides and body is empty', async () => {
    writeFileSync(path.join(agentsDir, 'telegram-foo.md'), '---\nallowedTools: []\ninitialActiveTools: []\n---\n\n');
    const result = await loadChannelPersona('telegram-foo', AVAILABLE);
    expect(result).toBeNull();
  });

  it('expands allowedTools globs', async () => {
    writeFileSync(
      path.join(agentsDir, 'telegram-foo.md'),
      '---\nallowedTools:\n  - memory.*\n  - channel.send\n---\n',
    );
    const result = await loadChannelPersona('telegram-foo', AVAILABLE);
    expect(result?.allowedToolNames?.sort()).toEqual(['channel.send', 'memory.read', 'memory.search', 'memory.write']);
    expect(result?.initialActiveToolNames).toBeUndefined();
    expect(result?.body).toBeUndefined();
  });

  it('passes initialActiveTools through unchanged', async () => {
    writeFileSync(
      path.join(agentsDir, 'telegram-foo.md'),
      '---\ninitialActiveTools:\n  - read\n  - bash\n---\n',
    );
    const result = await loadChannelPersona('telegram-foo', AVAILABLE);
    expect(result?.initialActiveToolNames).toEqual(['read', 'bash']);
  });

  it('returns body when frontmatter is present but empty and body has content', async () => {
    writeFileSync(
      path.join(agentsDir, 'telegram-foo.md'),
      '---\nallowedTools: []\n---\n\nBe extra polite in DMs.\n',
    );
    const result = await loadChannelPersona('telegram-foo', AVAILABLE);
    expect(result?.body).toBe('Be extra polite in DMs.');
  });

  it('returns body when no frontmatter at all', async () => {
    writeFileSync(path.join(agentsDir, 'telegram-foo.md'), 'Just a body, no frontmatter.\n');
    const result = await loadChannelPersona('telegram-foo', AVAILABLE);
    expect(result?.body).toBe('Just a body, no frontmatter.');
  });

  it('warns and returns null on completely empty file', async () => {
    writeFileSync(path.join(agentsDir, 'telegram-foo.md'), '');
    const result = await loadChannelPersona('telegram-foo', AVAILABLE);
    expect(result).toBeNull();
  });
});

describe('ensureChannelPersonaFiles', () => {
  let tmpDir: string;
  let agentsDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `persona-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    agentsDir = path.join(tmpDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(path.join(agentsDir, 'default.md'), '---\nallowedTools: []\n---\n');
    originalEnv = process.env.VARGOS_DATA_DIR;
    process.env.VARGOS_DATA_DIR = tmpDir;
    resetDataPaths();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.VARGOS_DATA_DIR;
    else process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates persona files for each channel from default.md', async () => {
    await ensureChannelPersonaFiles(['telegram-a', 'whatsapp-b']);
    const { readFileSync, existsSync } = await import('node:fs');
    expect(existsSync(path.join(agentsDir, 'telegram-a.md'))).toBe(true);
    expect(existsSync(path.join(agentsDir, 'whatsapp-b.md'))).toBe(true);
    expect(readFileSync(path.join(agentsDir, 'telegram-a.md'), 'utf-8')).toContain('allowedTools');
  });

  it('does not overwrite existing persona files', async () => {
    writeFileSync(path.join(agentsDir, 'telegram-a.md'), 'CUSTOM CONTENT');
    await ensureChannelPersonaFiles(['telegram-a']);
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(path.join(agentsDir, 'telegram-a.md'), 'utf-8')).toBe('CUSTOM CONTENT');
  });
});
