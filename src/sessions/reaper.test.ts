import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reapSessions } from './reaper.js';
import type { ISessionService, Session } from './types.js';

function makeSession(overrides: Partial<Session>): Session {
  return {
    sessionKey: 'test:1',
    kind: 'cron',
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
    ...overrides,
  };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function makeStore(sessions: Session[]): ISessionService {
  const deleted = new Set<string>();
  return {
    name: 'mock',
    events: {} as never,
    initialize: vi.fn(),
    close: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    addMessage: vi.fn(),
    getMessages: vi.fn(),
    list: vi.fn(async ({ kind }: { kind?: Session['kind'] } = {}) =>
      sessions.filter(s => !kind || s.kind === kind),
    ),
    delete: vi.fn(async (key: string) => {
      deleted.add(key);
      return true;
    }),
  } as unknown as ISessionService;
}

describe('reapSessions', () => {
  it('deletes expired cron sessions', async () => {
    const old = makeSession({ sessionKey: 'cron:old', kind: 'cron', updatedAt: daysAgo(8) });
    const store = makeStore([old]);

    const { pruned } = await reapSessions(store);

    expect(pruned).toBe(1);
    expect(store.delete).toHaveBeenCalledWith('cron:old');
  });

  it('deletes expired subagent sessions', async () => {
    const old = makeSession({ sessionKey: 'subagent:old', kind: 'subagent', updatedAt: daysAgo(4) });
    const store = makeStore([old]);

    const { pruned } = await reapSessions(store);

    expect(pruned).toBe(1);
    expect(store.delete).toHaveBeenCalledWith('subagent:old');
  });

  it('keeps recent sessions', async () => {
    const recent = makeSession({ sessionKey: 'cron:recent', kind: 'cron', updatedAt: daysAgo(1) });
    const store = makeStore([recent]);

    const { pruned } = await reapSessions(store);

    expect(pruned).toBe(0);
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('never deletes main sessions', async () => {
    const main = makeSession({ sessionKey: 'whatsapp:+61400000000', kind: 'main', updatedAt: daysAgo(30) });
    const store = makeStore([main]);

    const { pruned } = await reapSessions(store);

    expect(pruned).toBe(0);
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('applies custom TTL config', async () => {
    // With a 1-day cron TTL, a 2-day-old session should be pruned
    const old = makeSession({ sessionKey: 'cron:old', kind: 'cron', updatedAt: daysAgo(2) });
    const store = makeStore([old]);

    const { pruned } = await reapSessions(store, { cronTtlMs: 24 * 60 * 60 * 1000 });

    expect(pruned).toBe(1);
  });

  it('prunes expired sessions and keeps fresh ones in the same run', async () => {
    const stale = makeSession({ sessionKey: 'cron:stale', kind: 'cron', updatedAt: daysAgo(10) });
    const fresh = makeSession({ sessionKey: 'cron:fresh', kind: 'cron', updatedAt: daysAgo(2) });
    const store = makeStore([stale, fresh]);

    const { pruned } = await reapSessions(store);

    expect(pruned).toBe(1);
    expect(store.delete).toHaveBeenCalledWith('cron:stale');
    expect(store.delete).not.toHaveBeenCalledWith('cron:fresh');
  });
});
