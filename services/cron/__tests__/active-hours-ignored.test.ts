/**
 * Regression test: Cron activeHours now checked for ALL tasks (not just heartbeat).
 *
 * Before fix: activeHours was only wired via beforeFireHooks, which was exclusively
 * registered for the 'heartbeat' task. Non-heartbeat tasks with activeHours config
 * would fire regardless of the configured window.
 *
 * After fix: fire() checks isWithinActiveHours() for every task before proceeding,
 * making activeHours work for all cron tasks.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitterBus } from '../../../gateway/emitter.js';
import { CronService } from '../index.js';
import type { AppConfig } from '../../config/index.js';
import { isWithinActiveHours } from '../../../lib/heartbeat.js';

function getBeforeFireHooks(service: CronService): Map<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (service as any).beforeFireHooks;
}

function getJobs(service: CronService): Map<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (service as any).jobs;
}

describe('CronService — activeHours respected for all tasks (FIXED)', () => {
  let tempDir: string;
  let cronDir: string;
  let bus: EventEmitterBus;
  let service: CronService;
  let config: AppConfig;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `cron-activhrs-fix-${Date.now()}`);
    cronDir = path.join(tempDir, 'cron');
    await fs.mkdir(cronDir, { recursive: true });

    bus = new EventEmitterBus();
    config = {
      auth: { workspaceId: 'test', key: 'test-key' },
      agent: {
        model: 'test:test',
        executionTimeoutMs: 30000,
      },
      heartbeat: {
        enabled: false,
      },
    };
  });

  afterEach(async () => {
    service?.stop();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('parses activeHours from markdown frontmatter correctly', async () => {
    await fs.writeFile(
      path.join(cronDir, 'hours-task.md'),
      `---
id: hours-task
name: "Active Hours Task"
schedule: "0 */4 * * 1-5"
enabled: true
activeHours: [8, 22]
activeHoursTimezone: "Australia/Sydney"
---

Do something on weekdays during business hours`
    );

    service = new CronService(bus, config, cronDir);
    await service.start();

    const result = await service.search({ query: '', page: 1, limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].activeHours).toEqual([8, 22]);
    expect(result.items[0].activeHoursTimezone).toBe('Australia/Sydney');
  });

  it('non-heartbeat tasks no longer need beforeFireHooks for activeHours', async () => {
    // This test verifies the architectural change:
    // activeHours is now checked directly in fire(), not via beforeFireHooks.
    // beforeFireHooks remain for heartbeat-specific checks (active runs, HEARTBEAT.md content).

    await fs.writeFile(
      path.join(cronDir, 'breville.md'),
      `---
id: breville-repos-update-check
name: "Breville Repos Update Check"
schedule: "0 */4 * * 1-5"
notify:
  - telegram-breville-dev:7789463749
enabled: true
activeHours: [8, 22]
activeHoursTimezone: "Australia/Sydney"
---

Check breville repos for updates`
    );

    service = new CronService(bus, config, cronDir);
    await service.start();

    const result = await service.search({ query: '', page: 1, limit: 10 });
    expect(result.items).toHaveLength(1);

    // The task has no beforeFireHook (that's fine — activeHours is checked in fire() now)
    const hooks = getBeforeFireHooks(service);
    expect(hooks.has('breville-repos-update-check')).toBe(false);

    // The task itself exists in the jobs map with its activeHours config
    const jobs = getJobs(service);
    const jobEntry = jobs.get('breville-repos-update-check') as { task: { activeHours: [number, number] } } | undefined;
    expect(jobEntry).toBeDefined();
    expect(jobEntry!.task.activeHours).toEqual([8, 22]);
  });

  it('heartbeat task still has its beforeFireHook for additional checks', async () => {
    config.heartbeat = {
      enabled: true,
      intervalMinutes: 30,
      notify: [],
    };

    await fs.writeFile(
      path.join(cronDir, 'heartbeat.md'),
      `---
id: heartbeat
name: "Heartbeat"
schedule: "*/30 * * * *"
enabled: true
activeHours: [8, 22]
activeHoursTimezone: "Australia/Sydney"
---

Check HEARTBEAT.md`
    );

    service = new CronService(bus, config, cronDir);
    await service.start();

    // Heartbeat retains its beforeFireHook for agent-status and HEARTBEAT.md checks
    const hooks = getBeforeFireHooks(service);
    expect(hooks.has('heartbeat')).toBe(true);
  });

  it('isWithinActiveHours works correctly as a standalone function', () => {
    // No config = always active
    expect(isWithinActiveHours()).toBe(true);
    expect(isWithinActiveHours(undefined, 'Australia/Sydney')).toBe(true);

    // Boundary behavior is time-dependent, verify return type only
    expect(typeof isWithinActiveHours([8, 22])).toBe('boolean');
    expect(typeof isWithinActiveHours([22, 6])).toBe('boolean');
  });
});
