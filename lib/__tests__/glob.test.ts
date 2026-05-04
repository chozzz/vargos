import { describe, it, expect } from 'vitest';
import { matchesGlob } from '../glob.js';

describe('matchesGlob', () => {
  it('exact-matches when no wildcard', () => {
    expect(matchesGlob('memory.search', 'memory.search')).toBe(true);
    expect(matchesGlob('memory.search', 'memory.read')).toBe(false);
  });

  it('matches namespace prefix with *', () => {
    expect(matchesGlob('memory.*', 'memory.search')).toBe(true);
    expect(matchesGlob('memory.*', 'memory.read')).toBe(true);
    expect(matchesGlob('memory.*', 'channel.send')).toBe(false);
  });

  it('matches deeply nested namespaces', () => {
    expect(matchesGlob('mcp.atlassian.*', 'mcp.atlassian.create_issue')).toBe(true);
    expect(matchesGlob('mcp.atlassian.*', 'mcp.github.create_issue')).toBe(false);
  });

  it('lone * matches everything', () => {
    expect(matchesGlob('*', 'anything')).toBe(true);
    expect(matchesGlob('*', '')).toBe(true);
  });

  it('escapes regex specials in patterns', () => {
    expect(matchesGlob('a.b', 'a.b')).toBe(true);
    expect(matchesGlob('a.b', 'aXb')).toBe(false); // . is literal, not regex .
    expect(matchesGlob('a+b', 'a+b')).toBe(true);
    expect(matchesGlob('a+b', 'aab')).toBe(false);
  });

  it('handles multiple * in one pattern', () => {
    expect(matchesGlob('a*b*c', 'axbxc')).toBe(true);
    expect(matchesGlob('a*b*c', 'abc')).toBe(true);
    expect(matchesGlob('a*b*c', 'axbxd')).toBe(false);
  });
});
