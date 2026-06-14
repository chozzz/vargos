import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { resetDataPaths } from '../../lib/paths.js';
import { registerChannel } from '../channels.js';

function writeConfig(dataDir: string, config: Record<string, unknown>) {
  writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify(config, null, 2));
}
function channels(dataDir: string): Array<{ id: string; botToken?: string }> {
  return JSON.parse(readFileSync(path.join(dataDir, 'config.json'), 'utf-8')).channels ?? [];
}

describe('registerChannel (idempotent upsert)', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `cli-channels-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    originalEnv = process.env.VARGOS_DATA_DIR;
    process.env.VARGOS_DATA_DIR = tmpDir;
    resetDataPaths();
    writeConfig(tmpDir, {});
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.VARGOS_DATA_DIR;
    else process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a new channel and reports created: true', () => {
    expect(registerChannel({ id: 'tg1', type: 'telegram', botToken: 'AAA' })).toEqual({ created: true });
    expect(channels(tmpDir).map(c => c.id)).toEqual(['tg1']);
  });

  it('is idempotent — re-registering the same id reports created: false', () => {
    registerChannel({ id: 'wa1', type: 'whatsapp' });
    expect(registerChannel({ id: 'wa1', type: 'whatsapp' })).toEqual({ created: false });
    expect(channels(tmpDir).filter(c => c.id === 'wa1')).toHaveLength(1);
  });

  it('refreshes the bot token when re-registering with a new one', () => {
    registerChannel({ id: 'tg1', type: 'telegram', botToken: 'OLD' });
    registerChannel({ id: 'tg1', type: 'telegram', botToken: 'NEW' });
    expect(channels(tmpDir).find(c => c.id === 'tg1')?.botToken).toBe('NEW');
  });
});
