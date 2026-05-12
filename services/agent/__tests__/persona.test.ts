import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { resetDataPaths } from '../../../lib/paths.js';
import { loadChannelPersona } from '../persona.js';

describe('loadChannelPersona', () => {
  let tmpDir: string;
  let agentsDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `persona-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    agentsDir = path.join(tmpDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    // default.md must exist for ensureChannelPersonaFiles (called inside loadChannelPersona) to seed
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

  it('seeds the file from default.md on first call when missing', async () => {
    const file = path.join(agentsDir, 'telegram-foo.md');
    expect(existsSync(file)).toBe(false);
    // default.md has empty allowedTools and no body → no overrides → returns null
    const result = await loadChannelPersona('telegram-foo');
    expect(result).toBeNull();
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf-8')).toContain('allowedTools');
  });

  it('returns null when default.md is missing', async () => {
    rmSync(path.join(agentsDir, 'default.md'));
    const result = await loadChannelPersona('telegram-foo');
    expect(result).toBeNull();
  });

  it('returns null and warns on completely empty file', async () => {
    writeFileSync(path.join(agentsDir, 'telegram-foo.md'), '');
    expect(await loadChannelPersona('telegram-foo')).toBeNull();
  });

  it('returns null when frontmatter has no overrides and body is empty', async () => {
    writeFileSync(path.join(agentsDir, 'telegram-foo.md'), '---\n---\n\n');
    expect(await loadChannelPersona('telegram-foo')).toBeNull();
  });

  it('returns parsed allowedTools from frontmatter', async () => {
    writeFileSync(
      path.join(agentsDir, 'telegram-foo.md'),
      '---\nallowedTools:\n  - memory.*\n  - channel.send\n---\n',
    );
    const result = await loadChannelPersona('telegram-foo');
    expect(result?.meta.allowedTools).toEqual(['memory.*', 'channel.send']);
    expect(result?.body).toBe('');
  });

  it('returns body when frontmatter is empty but body has content', async () => {
    writeFileSync(
      path.join(agentsDir, 'telegram-foo.md'),
      '---\nallowedTools: []\n---\n\nBe extra polite in DMs.\n',
    );
    const result = await loadChannelPersona('telegram-foo');
    expect(result?.body).toBe('Be extra polite in DMs.');
  });

  it('returns body when no frontmatter at all', async () => {
    writeFileSync(path.join(agentsDir, 'telegram-foo.md'), 'Just a body, no frontmatter.\n');
    const result = await loadChannelPersona('telegram-foo');
    expect(result?.meta).toEqual({});
    expect(result?.body).toBe('Just a body, no frontmatter.');
  });

  it('returns both meta and body when both present', async () => {
    writeFileSync(
      path.join(agentsDir, 'telegram-foo.md'),
      '---\nallowedTools:\n  - memory.*\n---\n\nBe concise.\n',
    );
    const result = await loadChannelPersona('telegram-foo');
    expect(result?.meta.allowedTools).toEqual(['memory.*']);
    expect(result?.body).toBe('Be concise.');
  });

  it('does not overwrite existing persona files on subsequent loads', async () => {
    const file = path.join(agentsDir, 'telegram-foo.md');
    writeFileSync(file, '---\nallowedTools:\n  - memory.search\n---\n\nCustom body.\n');
    await loadChannelPersona('telegram-foo');
    expect(readFileSync(file, 'utf-8')).toContain('Custom body.');
    // Second load reads the same file, not re-seeded
    const result = await loadChannelPersona('telegram-foo');
    expect(result?.meta.allowedTools).toEqual(['memory.search']);
    expect(result?.body).toBe('Custom body.');
  });
});
