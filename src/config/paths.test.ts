import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import {
  initPaths,
  resetPaths,
  resolveDataDir,
  resolveWorkspaceDir,
  resolveSessionsDir,
  resolveSessionFile,
  resolveMediaDir,
  resolveChannelsDir,
  resolveCacheDir,
} from './paths.js';

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {
    VARGOS_DATA_DIR: process.env.VARGOS_DATA_DIR,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
  };
  delete process.env.VARGOS_DATA_DIR;
  delete process.env.XDG_CACHE_HOME;
  resetPaths();
});

afterEach(() => {
  resetPaths();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('resolveDataDir', () => {
  it('defaults to ~/.vargos', () => {
    expect(resolveDataDir()).toBe(path.join(os.homedir(), '.vargos'));
  });

  it('uses VARGOS_DATA_DIR env when set', () => {
    process.env.VARGOS_DATA_DIR = '/tmp/custom-vargos';
    expect(resolveDataDir()).toBe('/tmp/custom-vargos');
  });
});

describe('initPaths', () => {
  it('sets custom dataDir', () => {
    initPaths({ dataDir: '/opt/vargos' });
    expect(resolveDataDir()).toBe('/opt/vargos');
  });

  it('sets custom workspace', () => {
    initPaths({ dataDir: '/opt/vargos', workspace: '/opt/workspace' });
    expect(resolveWorkspaceDir()).toBe('/opt/workspace');
  });

  it('expands tilde in dataDir', () => {
    initPaths({ dataDir: '~/my-vargos' });
    expect(resolveDataDir()).toBe(path.join(os.homedir(), 'my-vargos'));
  });

  it('defaults workspace to {dataDir}/workspace', () => {
    initPaths({ dataDir: '/opt/vargos' });
    expect(resolveWorkspaceDir()).toBe('/opt/vargos/workspace');
  });
});

describe('resolveWorkspaceDir', () => {
  it('defaults to {dataDir}/workspace without init', () => {
    expect(resolveWorkspaceDir()).toBe(path.join(os.homedir(), '.vargos', 'workspace'));
  });
});

describe('resolveSessionsDir', () => {
  it('returns {dataDir}/sessions', () => {
    initPaths({ dataDir: '/data' });
    expect(resolveSessionsDir()).toBe('/data/sessions');
  });
});

describe('resolveSessionFile', () => {
  it('replaces colons with hyphens and appends .jsonl', () => {
    initPaths({ dataDir: '/data' });
    expect(resolveSessionFile('telegram:123')).toBe('/data/sessions/telegram-123.jsonl');
  });
});

describe('resolveMediaDir', () => {
  it('returns {dataDir}/media/{sanitized-key} with sessionKey', () => {
    initPaths({ dataDir: '/data' });
    expect(resolveMediaDir('wa:user:42')).toBe('/data/media/wa-user-42');
  });

  it('returns {dataDir}/media without sessionKey', () => {
    initPaths({ dataDir: '/data' });
    expect(resolveMediaDir()).toBe('/data/media');
  });
});

describe('resolveChannelsDir', () => {
  it('returns {dataDir}/channels', () => {
    initPaths({ dataDir: '/data' });
    expect(resolveChannelsDir()).toBe('/data/channels');
  });
});

describe('resolveCacheDir', () => {
  it('uses XDG_CACHE_HOME when set', () => {
    process.env.XDG_CACHE_HOME = '/tmp/xdg-cache';
    expect(resolveCacheDir()).toBe('/tmp/xdg-cache/vargos');
  });

  it('defaults to ~/.cache/vargos', () => {
    expect(resolveCacheDir()).toBe(path.join(os.homedir(), '.cache', 'vargos'));
  });
});

describe('resetPaths', () => {
  it('clears cached paths so defaults apply again', () => {
    initPaths({ dataDir: '/custom' });
    expect(resolveDataDir()).toBe('/custom');
    resetPaths();
    expect(resolveDataDir()).toBe(path.join(os.homedir(), '.vargos'));
  });
});
