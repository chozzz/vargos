import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { expandTilde } from './path.js';

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
