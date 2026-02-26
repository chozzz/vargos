import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  channelSessionKey,
  cronSessionKey,
  webhookSessionKey,
  cliSessionKey,
  subagentSessionKey,
  parseSessionKey,
  isSubagentSessionKey,
  getSubagentDepth,
  canSpawnSubagent,
} from './keys.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('channelSessionKey', () => {
  it('joins channel and userId', () => {
    expect(channelSessionKey('whatsapp', '61423222658')).toBe('whatsapp:61423222658');
  });
});

describe('cronSessionKey', () => {
  it('includes task ID and date', () => {
    vi.useFakeTimers({ now: new Date('2024-11-14T12:00:00Z') });
    expect(cronSessionKey('cron-abc')).toBe('cron:cron-abc:2024-11-14');
    vi.useRealTimers();
  });
});

describe('webhookSessionKey', () => {
  it('includes hook ID and timestamp', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    expect(webhookSessionKey('deploy')).toBe('webhook:deploy:1700000000000');
  });
});

describe('cliSessionKey', () => {
  it('includes command and timestamp', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    expect(cliSessionKey('run')).toBe('cli:run:1700000000000');
  });
});

describe('subagentSessionKey', () => {
  it('appends :subagent: with timestamp', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const key = subagentSessionKey('whatsapp:123');
    expect(key).toMatch(/^whatsapp:123:subagent:1700000000000-[a-z0-9]+$/);
  });
});

describe('parseSessionKey', () => {
  it('parses channel key', () => {
    expect(parseSessionKey('whatsapp:61423222658')).toEqual({ type: 'whatsapp', id: '61423222658' });
  });

  it('parses cron key with date', () => {
    expect(parseSessionKey('cron:task-1:2024-11-14')).toEqual({ type: 'cron', id: 'task-1:2024-11-14' });
  });

  it('parses subagent key — returns root type', () => {
    expect(parseSessionKey('whatsapp:123:subagent:1708-abc')).toEqual({ type: 'whatsapp', id: '123' });
  });

  it('handles bare key with no colon', () => {
    expect(parseSessionKey('orphan')).toEqual({ type: 'orphan', id: '' });
  });
});

describe('isSubagentSessionKey', () => {
  it('returns true for :subagent: in key', () => {
    expect(isSubagentSessionKey('whatsapp:123:subagent:1708-x7k')).toBe(true);
    expect(isSubagentSessionKey('cli:chat:subagent:1708-abc')).toBe(true);
  });

  it('returns false for regular session keys', () => {
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
