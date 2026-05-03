import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { resolveSkillPaths } from '../skills.js';

describe('resolveSkillPaths', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `skills-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns nothing when no skills/ subdirs exist', () => {
    expect(resolveSkillPaths(tmpDir)).toEqual([]);
  });

  it('appends "skills" to each root and filters to existing', () => {
    const a = path.join(tmpDir, 'a');
    const b = path.join(tmpDir, 'b');
    mkdirSync(path.join(a, 'skills'), { recursive: true });
    mkdirSync(b, { recursive: true });
    expect(resolveSkillPaths(a, b)).toEqual([path.join(a, 'skills')]);
  });

  it('preserves caller-defined order', () => {
    const a = path.join(tmpDir, 'a');
    const b = path.join(tmpDir, 'b');
    const c = path.join(tmpDir, 'c');
    mkdirSync(path.join(a, 'skills'), { recursive: true });
    mkdirSync(path.join(b, 'skills'), { recursive: true });
    mkdirSync(path.join(c, 'skills'), { recursive: true });
    expect(resolveSkillPaths(c, a, b)).toEqual([
      path.join(c, 'skills'),
      path.join(a, 'skills'),
      path.join(b, 'skills'),
    ]);
  });

  it('accepts zero args', () => {
    expect(resolveSkillPaths()).toEqual([]);
  });
});
