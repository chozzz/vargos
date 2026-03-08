import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { expandTilde, validateBoundary } from './path.js';

const home = os.homedir();

describe('expandTilde', () => {
  it('should expand bare ~ to homedir', () => {
    expect(expandTilde('~')).toBe(home);
  });

  it('should expand ~/path to homedir/path', () => {
    expect(expandTilde('~/foo/bar')).toBe(path.join(home, 'foo/bar'));
  });

  it('should expand ~\\path for windows-style separators', () => {
    expect(expandTilde('~\\windows\\path')).toBe(path.join(home, 'windows\\path'));
  });

  it('should leave absolute paths unchanged', () => {
    expect(expandTilde('/absolute/path')).toBe('/absolute/path');
  });

  it('should leave relative paths unchanged', () => {
    expect(expandTilde('relative/path')).toBe('relative/path');
  });

  it('should leave empty string unchanged', () => {
    expect(expandTilde('')).toBe('');
  });
});

describe('validateBoundary', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-boundary-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('passes and returns resolved path for file within boundary', async () => {
    const file = path.join(tempDir, 'file.txt');
    await fs.writeFile(file, 'hello');
    const result = await validateBoundary(file, tempDir);
    expect(result).toBe(await fs.realpath(file));
  });

  it('catches ../ traversal — path.resolve normalizes, prefix check rejects', async () => {
    const outside = path.resolve(tempDir, '..', 'escape.txt');
    await expect(validateBoundary(outside, tempDir)).rejects.toThrow('Path outside allowed boundary');
  });

  it('passes when path is in allowlist even if outside boundary', async () => {
    const allowDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-allow-'));
    try {
      const file = path.join(allowDir, 'allowed.txt');
      await fs.writeFile(file, 'allowed');
      const result = await validateBoundary(file, tempDir, [allowDir]);
      expect(result).toBe(await fs.realpath(file));
    } finally {
      await fs.rm(allowDir, { recursive: true, force: true });
    }
  });

  it('throws for path outside boundary and not in allowlist', async () => {
    const outside = path.join(os.tmpdir(), 'vargos-no-access.txt');
    await expect(validateBoundary(outside, tempDir, [])).rejects.toThrow('Path outside allowed boundary');
  });

  it('passes for non-existent file within boundary via ancestor resolution', async () => {
    const newFile = path.join(tempDir, 'subdir', 'new.txt');
    // tempDir exists but subdir/new.txt does not
    const result = await validateBoundary(newFile, tempDir);
    expect(result.startsWith(await fs.realpath(tempDir))).toBe(true);
  });

  it('empty allowlist behaves like no allowlist', async () => {
    const outside = path.resolve(tempDir, '..', 'escape.txt');
    await expect(validateBoundary(outside, tempDir, [])).rejects.toThrow('Path outside allowed boundary');
  });

  it('passes for path equal to boundary itself', async () => {
    const result = await validateBoundary(tempDir, tempDir);
    expect(result).toBe(await fs.realpath(tempDir));
  });
});
