import { describe, it, expect } from 'vitest';
import {
  isSubagentSessionKey,
  getSubagentDepth,
  canSpawnSubagent,
} from './errors.js';

describe('isSubagentSessionKey', () => {
  it('should return true for :subagent: in key', () => {
    expect(isSubagentSessionKey('whatsapp:123:subagent:1708-x7k')).toBe(true);
    expect(isSubagentSessionKey('cli:chat:subagent:1708-abc')).toBe(true);
  });

  it('should return false for regular session keys', () => {
    expect(isSubagentSessionKey('whatsapp:user123')).toBe(false);
    expect(isSubagentSessionKey('cron:daily')).toBe(false);
    expect(isSubagentSessionKey('cli:chat')).toBe(false);
    expect(isSubagentSessionKey('agent:task1')).toBe(false);
  });
});

describe('getSubagentDepth', () => {
  it('returns 0 for non-subagent keys', () => {
    expect(getSubagentDepth('cli:chat')).toBe(0);
    expect(getSubagentDepth('whatsapp:user123')).toBe(0);
  });

  it('returns 1 for depth-1 subagent', () => {
    expect(getSubagentDepth('cli:chat:subagent:1708-abc')).toBe(1);
  });

  it('returns 2 for depth-2 subagent', () => {
    expect(getSubagentDepth('cli:chat:subagent:1708-abc:subagent:1709-def')).toBe(2);
  });

  it('returns 3 for depth-3 subagent', () => {
    expect(getSubagentDepth('cli:chat:subagent:a:subagent:b:subagent:c')).toBe(3);
  });
});

describe('canSpawnSubagent', () => {
  it('allows spawning from non-subagent', () => {
    expect(canSpawnSubagent('cli:chat')).toBe(true);
  });

  it('allows spawning from depth-1 subagent', () => {
    expect(canSpawnSubagent('cli:chat:subagent:abc')).toBe(true);
  });

  it('allows spawning from depth-2 subagent', () => {
    expect(canSpawnSubagent('cli:chat:subagent:a:subagent:b')).toBe(true);
  });

  it('blocks spawning at depth 3 (default max)', () => {
    expect(canSpawnSubagent('cli:chat:subagent:a:subagent:b:subagent:c')).toBe(false);
  });

  it('respects custom maxDepth', () => {
    expect(canSpawnSubagent('cli:chat:subagent:a', 1)).toBe(false);
    expect(canSpawnSubagent('cli:chat', 1)).toBe(true);
  });
});
