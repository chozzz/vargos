import { describe, it, expect } from 'vitest';
import { extractLoaderArgs } from './loader-args.js';

describe('extractLoaderArgs', () => {
  it('extracts --require and --import pairs', () => {
    const execArgv = [
      '--require', '/path/to/tsx/preflight.cjs',
      '--import', 'file:///path/to/tsx/loader.mjs',
      '--eval', 'some bootstrap code',
    ];
    expect(extractLoaderArgs(execArgv)).toEqual([
      '--require', '/path/to/tsx/preflight.cjs',
      '--import', 'file:///path/to/tsx/loader.mjs',
    ]);
  });

  it('returns empty array when no loader flags', () => {
    expect(extractLoaderArgs(['--eval', 'code', '--inspect'])).toEqual([]);
  });

  it('returns empty array for empty execArgv', () => {
    expect(extractLoaderArgs([])).toEqual([]);
  });

  it('handles --require only', () => {
    expect(extractLoaderArgs(['--require', 'ts-node/register'])).toEqual([
      '--require', 'ts-node/register',
    ]);
  });

  it('handles multiple --import flags', () => {
    const execArgv = [
      '--import', 'loader-a.mjs',
      '--import', 'loader-b.mjs',
    ];
    expect(extractLoaderArgs(execArgv)).toEqual(execArgv);
  });
});
