/**
 * Regression: cron.list must return tasks when called with no pagination params,
 * e.g. `echo '{"jsonrpc":"2.0","method":"cron.list","params":{}}' | nc localhost 9000`.
 * The schema defaults page/limit, so the handler never slices with NaN.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EmitterBus } from '../../../core/bus.js';
import { CronService } from '../index.js';
import type { CronTask } from '../../config/index.js';

describe('cron.list', () => {
  let tempDir: string;
  let cronDir: string;
  let bus: EmitterBus;
  let service: CronService;

  const search = (params: object) => bus.call<{ items: CronTask[]; page: number; limit: number }>('cron.list', params);

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `cron-search-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    cronDir = path.join(tempDir, 'cron');
    await fs.mkdir(cronDir, { recursive: true });
    await fs.writeFile(path.join(cronDir, 'daily.md'),
      `---\nid: daily\nname: "Daily Task"\nschedule: "0 9 * * *"\nenabled: true\n---\n\nDo the daily thing`);

    bus = new EmitterBus();
    service = new CronService(cronDir);
    bus.beginLoading('cron');
    await service.init(bus);
    bus.endLoading();
  });

  afterEach(async () => {
    service?.dispose();
    bus.releaseService('cron');
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns tasks when called with no pagination params (params: {})', async () => {
    const result = await search({});
    expect(result.items.map(t => t.id)).toContain('daily');
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('respects explicit pagination', async () => {
    const result = await search({ query: '', page: 1, limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('daily');
  });
});
