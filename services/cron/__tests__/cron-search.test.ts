/**
 * Regression: cron.search must return tasks when called with no pagination params,
 * e.g. `echo '{"jsonrpc":"2.0","method":"cron.search","params":{}}' | nc localhost 9000`.
 *
 * Before fix: `page` had no default, so offset = (undefined - 1) * limit = NaN, and
 * items.slice(NaN, NaN) returned [] — no crons shown at all.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitterBus } from '../../../gateway/emitter.js';
import { CronService } from '../index.js';
import type { AppConfig } from '../../config/index.js';
import type { EventMap } from '../../../gateway/events.js';

describe('CronService.search', () => {
  let tempDir: string;
  let cronDir: string;
  let bus: EventEmitterBus;
  let service: CronService;
  let config: AppConfig;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `cron-search-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    cronDir = path.join(tempDir, 'cron');
    await fs.mkdir(cronDir, { recursive: true });
    await fs.writeFile(
      path.join(cronDir, 'daily.md'),
      `---
id: daily
name: "Daily Task"
schedule: "0 9 * * *"
enabled: true
---

Do the daily thing`,
    );

    bus = new EventEmitterBus();
    config = {
      auth: { workspaceId: 'test', key: 'test-key' },
      agent: { model: 'test:test', executionTimeoutMs: 30000 },
      heartbeat: { enabled: false },
    };
    service = new CronService(bus, config, cronDir);
    await service.start();
  });

  afterEach(async () => {
    service?.stop();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns tasks when called with no pagination params (params: {})', async () => {
    // Untyped JSON-RPC callers omit page/limit — the bus passes params through as-is.
    const result = await service.search({} as EventMap['cron.search']['params']);
    expect(result.items.map(t => t.id)).toContain('daily');
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('respects explicit pagination', async () => {
    const result = await service.search({ query: '', page: 1, limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('daily');
  });
});
