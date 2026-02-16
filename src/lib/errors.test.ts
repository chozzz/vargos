import { describe, it, expect } from 'vitest';
import {
  isSubagentSessionKey,
  isToolAllowedForSubagent,
  SUBAGENT_DENIED_TOOLS,
} from './errors.js';

describe('isSubagentSessionKey', () => {
  it('should return true for agent: prefix', () => {
    expect(isSubagentSessionKey('agent:task1')).toBe(true);
  });

  it('should return true for :subagent: in key', () => {
    expect(isSubagentSessionKey('wa:user:subagent:123')).toBe(true);
  });

  it('should return true for keys containing subagent', () => {
    expect(isSubagentSessionKey('chat:subagent')).toBe(true);
  });

  it('should return false for regular session keys', () => {
    expect(isSubagentSessionKey('wa:user123')).toBe(false);
    expect(isSubagentSessionKey('cron:daily')).toBe(false);
    expect(isSubagentSessionKey('chat:main')).toBe(false);
  });
});

describe('isToolAllowedForSubagent', () => {
  it('should deny each tool in SUBAGENT_DENIED_TOOLS', () => {
    for (const tool of SUBAGENT_DENIED_TOOLS) {
      expect(isToolAllowedForSubagent(tool)).toBe(false);
    }
  });

  it('should allow tools not in the denied list', () => {
    expect(isToolAllowedForSubagent('read')).toBe(true);
    expect(isToolAllowedForSubagent('write')).toBe(true);
    expect(isToolAllowedForSubagent('exec')).toBe(true);
    expect(isToolAllowedForSubagent('browser')).toBe(true);
  });
});

describe('SUBAGENT_DENIED_TOOLS', () => {
  it('should contain exactly 4 items', () => {
    expect(SUBAGENT_DENIED_TOOLS).toHaveLength(4);
  });
});
