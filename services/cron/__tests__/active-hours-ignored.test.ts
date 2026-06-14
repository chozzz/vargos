/**
 * Cron activeHours is checked for ALL tasks in fire() (not just heartbeat via
 * beforeFireHooks). Heartbeat keeps its beforeFireHook for the extra checks
 * (active runs, HEARTBEAT.md content).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EmitterBus } from '../../../core/bus.js';
import { CronService } from '../index.js';
import type { CronTask } from '../../config/index.js';
import { isWithinActiveHours } from '../heartbeat.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const beforeFireHooks = (s: CronService): Map<string, unknown> => (s as any).beforeFireHooks;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jobs = (s: CronService): Map<string, { task: CronTask }> => (s as any).jobs;

describe('CronService — activeHours respected for all tasks', () => {
  let tempDir: string;
  let cronDir: string;
  let bus: EmitterBus;
  let service: CronService;

  const search = () => bus.call<{ items: CronTask[] }>('cron.search', { query: '', page: 1, limit: 10 });

  async function start(): Promise<void> {
    service = new CronService(cronDir);
    bus.beginLoading('cron');
    await service.init(bus);
    bus.endLoading();
  }

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `cron-activehrs-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    cronDir = path.join(tempDir, 'cron');
    await fs.mkdir(cronDir, { recursive: true });
    bus = new EmitterBus();
  });

  afterEach(async () => {
    service?.dispose();
    bus.releaseService('cron');
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('parses activeHours from markdown frontmatter correctly', async () => {
    await fs.writeFile(path.join(cronDir, 'hours-task.md'),
      `---\nid: hours-task\nname: "Active Hours Task"\nschedule: "0 */4 * * 1-5"\nenabled: true\nactiveHours: [8, 22]\nactiveHoursTimezone: "Australia/Sydney"\n---\n\nDo something on weekdays during business hours`);
    await start();
    const result = await search();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].activeHours).toEqual([8, 22]);
    expect(result.items[0].activeHoursTimezone).toBe('Australia/Sydney');
  });

  it('non-heartbeat tasks need no beforeFireHook (activeHours checked in fire())', async () => {
    await fs.writeFile(path.join(cronDir, 'breville.md'),
      `---\nid: breville-repos-update-check\nname: "Breville Repos Update Check"\nschedule: "0 */4 * * 1-5"\nnotify:\n  - telegram-breville-dev:7789463749\nenabled: true\nactiveHours: [8, 22]\nactiveHoursTimezone: "Australia/Sydney"\n---\n\nCheck breville repos for updates`);
    await start();

    expect((await search()).items).toHaveLength(1);
    expect(beforeFireHooks(service).has('breville-repos-update-check')).toBe(false);
    const jobEntry = jobs(service).get('breville-repos-update-check');
    expect(jobEntry).toBeDefined();
    expect(jobEntry!.task.activeHours).toEqual([8, 22]);
  });

  it('heartbeat task still has its beforeFireHook for additional checks', async () => {
    await fs.writeFile(path.join(cronDir, 'heartbeat.md'),
      `---\nid: heartbeat\nname: "Heartbeat"\nschedule: "*/30 * * * *"\nenabled: true\nactiveHours: [8, 22]\nactiveHoursTimezone: "Australia/Sydney"\n---\n\nCheck HEARTBEAT.md`);
    await start();
    expect(beforeFireHooks(service).has('heartbeat')).toBe(true);
  });

  it('isWithinActiveHours works correctly as a standalone function', () => {
    expect(isWithinActiveHours()).toBe(true);
    expect(isWithinActiveHours(undefined, 'Australia/Sydney')).toBe(true);
    expect(typeof isWithinActiveHours([8, 22])).toBe('boolean');
    expect(typeof isWithinActiveHours([22, 6])).toBe('boolean');
  });
});
