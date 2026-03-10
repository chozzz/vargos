import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveFsPath } from './resolve.js';
import type { ToolContext } from '../types.js';

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionKey: 'test',
    workingDir: '/workspace',
    ...overrides,
  };
}

describe('resolveFsPath', () => {
  it('resolves a relative path against workingDir', () => {
    expect(resolveFsPath('foo/bar.txt', ctx())).toBe('/workspace/foo/bar.txt');
  });

  it('resolves an absolute path unchanged', () => {
    expect(resolveFsPath('/tmp/file.txt', ctx())).toBe('/tmp/file.txt');
  });

  it('expands tilde to homedir', () => {
    expect(resolveFsPath('~/notes.txt', ctx())).toBe(path.join(os.homedir(), 'notes.txt'));
  });
});
