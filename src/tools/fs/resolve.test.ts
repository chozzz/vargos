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
  it('resolves a relative path against workingDir', async () => {
    const result = await resolveFsPath('foo/bar.txt', ctx());
    expect(result).toEqual({ ok: true, filePath: '/workspace/foo/bar.txt' });
  });

  it('resolves an absolute path unchanged', async () => {
    const result = await resolveFsPath('/tmp/file.txt', ctx());
    expect(result).toEqual({ ok: true, filePath: '/tmp/file.txt' });
  });

  it('expands tilde to homedir', async () => {
    const result = await resolveFsPath('~/notes.txt', ctx());
    expect(result).toEqual({ ok: true, filePath: path.join(os.homedir(), 'notes.txt') });
  });

  it('returns error when path is outside boundary', async () => {
    const result = await resolveFsPath('/etc/passwd', ctx({ boundary: '/workspace' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.isError).toBe(true);
      expect(result.error.content[0]).toMatchObject({ type: 'text' });
    }
  });

  it('allows path within boundary', async () => {
    // Use a real path that exists — /tmp is available everywhere
    const result = await resolveFsPath('/tmp', ctx({ boundary: '/tmp' }));
    expect(result.ok).toBe(true);
  });
});
