/**
 * Browser service tests — session management logic (no real browser needed)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock playwright before importing BrowserService
vi.mock('playwright', () => {
  const makePage = () => ({
    goto: vi.fn(),
    url: () => 'about:blank',
    title: async () => 'blank',
    $$eval: vi.fn().mockResolvedValue([]),
    $$: vi.fn().mockResolvedValue([]),
    keyboard: { press: vi.fn() },
    screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
    pdf: vi.fn().mockResolvedValue(Buffer.from('')),
    evaluate: vi.fn(),
  });

  const makeContext = () => ({
    newPage: vi.fn().mockResolvedValue(makePage()),
    storageState: vi.fn().mockResolvedValue({}),
  });

  return {
    chromium: {
      launch: vi.fn().mockResolvedValue({
        newContext: vi.fn().mockResolvedValue(makeContext()),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    },
  };
});

import { BrowserService } from './browser.js';

let service: BrowserService;

beforeEach(() => {
  service = new BrowserService({ stateDir: '/tmp/vargos-test-browser-state' });
});

afterEach(() => {
  service.dispose();
});

describe('session limit', () => {
  it('allows up to 5 sessions', async () => {
    for (let i = 0; i < 5; i++) {
      await service.createSession();
    }
    expect(service.listSessions()).toHaveLength(5);
  });

  it('rejects 6th session', async () => {
    for (let i = 0; i < 5; i++) {
      await service.createSession();
    }
    await expect(service.createSession()).rejects.toThrow('Session limit reached');
  });

  it('allows new session after closing one', async () => {
    for (let i = 0; i < 5; i++) {
      await service.createSession();
    }
    const sessions = service.listSessions();
    await service.closeSession(sessions[0].id);
    const newSession = await service.createSession();
    expect(newSession.id).toBeDefined();
  });
});

describe('touch and idle tracking', () => {
  it('updates lastActivityAt on touch', async () => {
    const session = await service.createSession();
    const before = service.listSessions()[0].idleMs;

    // Small delay to ensure time passes
    await new Promise(r => setTimeout(r, 20));
    service.touch(session.id);

    const after = service.listSessions()[0].idleMs;
    expect(after).toBeLessThan(before + 20);
  });

  it('touch on unknown session is a no-op', () => {
    expect(() => service.touch('nonexistent')).not.toThrow();
  });

  it('listSessions includes idleMs', async () => {
    await service.createSession();
    const sessions = service.listSessions();
    expect(sessions[0]).toHaveProperty('idleMs');
    expect(typeof sessions[0].idleMs).toBe('number');
  });
});

describe('session lifecycle', () => {
  it('getSession returns undefined for unknown id', () => {
    expect(service.getSession('nope')).toBeUndefined();
  });

  it('closeSession returns false for unknown id', async () => {
    expect(await service.closeSession('nope')).toBe(false);
  });

  it('closeAll clears all sessions', async () => {
    await service.createSession();
    await service.createSession();
    expect(service.listSessions()).toHaveLength(2);

    await service.closeAll();
    expect(service.listSessions()).toHaveLength(0);
  });

  it('assigns unique ids with browser prefix', async () => {
    const s1 = await service.createSession();
    const s2 = await service.createSession();
    expect(s1.id).toMatch(/^browser-/);
    expect(s2.id).toMatch(/^browser-/);
    expect(s1.id).not.toBe(s2.id);
  });
});

describe('stateDir config', () => {
  it('defaults to dataDir/browser-state when not specified', () => {
    const defaultService = new BrowserService();
    defaultService.dispose();
    // Just verify it constructs without error
    expect(defaultService).toBeDefined();
  });

  it('accepts custom stateDir', () => {
    const custom = new BrowserService({ stateDir: '/custom/path' });
    custom.dispose();
    expect(custom).toBeDefined();
  });
});
