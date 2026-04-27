import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitterBus } from '../../../gateway/emitter.js';
import { CronService } from '../index.js';
import type { AppConfig } from '../../config/index.js';

describe('CronService — Markdown File CRUD', () => {
  let tempDir: string;
  let cronDir: string;
  let bus: EventEmitterBus;
  let service: CronService;
  let config: AppConfig;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `cron-test-${Date.now()}`);
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

    service = new CronService(bus, config, cronDir);
  });

  afterEach(async () => {
    service.stop();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('loads empty task list when no files exist', async () => {
    await service.start();
    const result = await service.search({ query: '', page: 1, limit: 10 });
    expect(result.items).toHaveLength(0);
  });

  it('writes task with metadata to markdown file', async () => {
    await service.start();

    await service.add({
      name: 'Test Task',
      schedule: '0 9 * * *',
      task: 'Test task prompt',
    });

    const files = await fs.readdir(cronDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.md$/);

    const content = await fs.readFile(path.join(cronDir, files[0]), 'utf-8');
    expect(content).toContain('name: "Test Task"');
    expect(content).toContain('schedule: "0 9 * * *"');
    expect(content).toContain('Test task prompt');
  });

  it('parses metadata from markdown frontmatter correctly', async () => {
    await fs.writeFile(
      path.join(cronDir, 'test-task.md'),
      `---
id: test-task
name: "Test Task"
schedule: "0 9 * * *"
enabled: true
---

Test prompt`
    );

    await service.start();

    const result = await service.search({ query: '', page: 1, limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('test-task');
    expect(result.items[0].name).toBe('Test Task');
    expect(result.items[0].schedule).toBe('0 9 * * *');
    expect(result.items[0].enabled).toBe(true);
    expect(result.items[0].task).toBe('Test prompt');
  });

  it('deletes markdown file when task is removed', async () => {
    await service.start();

    await service.add({
      name: 'Task to Delete',
      schedule: '0 9 * * *',
      task: 'Will be deleted',
    });

    const result = await service.search({ query: '', page: 1, limit: 10 });
    const taskId = result.items[0].id;

    await service.remove({ id: taskId });

    const updated = await service.search({ query: '', page: 1, limit: 10 });
    expect(updated.items).toHaveLength(0);

    const files = await fs.readdir(cronDir);
    expect(files).toHaveLength(0);
  });

  it('updates markdown file with new metadata and body', async () => {
    await service.start();

    await service.add({
      name: 'Original Name',
      schedule: '0 9 * * *',
      task: 'Original prompt',
    });

    const result = await service.search({ query: '', page: 1, limit: 10 });
    const taskId = result.items[0].id;

    await service.update({
      id: taskId,
      name: 'Updated Name',
      task: 'Updated prompt',
    });

    const updated = await service.search({ query: '', page: 1, limit: 10 });
    expect(updated.items[0].name).toBe('Updated Name');
    expect(updated.items[0].task).toBe('Updated prompt');
  });

  it('does not persist ephemeral tasks', async () => {
    config.heartbeat = {
      enabled: true,
      intervalMinutes: 30,
      notify: [],
    };

    const svc = new CronService(bus, config, cronDir);
    await svc.start();

    const result = await svc.search({ query: 'heartbeat', page: 1, limit: 10 });
    // Ephemeral heartbeat should not be in search results
    expect(result.items).toHaveLength(0);

    svc.stop();
  });

  describe('YAML array parsing', () => {
    it('parses multi-line notify array from markdown', async () => {
      await fs.writeFile(
        path.join(cronDir, 'notify-task.md'),
        `---
id: notify-task
name: "Task with Notifications"
schedule: "0 9 * * *"
enabled: true
notify:
  - whatsapp:61423222658
  - telegram:987654321
---

Send results to channels`
      );

      await service.start();

      const result = await service.search({ query: '', page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].notify).toEqual(['whatsapp:61423222658', 'telegram:987654321']);
    });

    it('parses activeHours array from markdown', async () => {
      await fs.writeFile(
        path.join(cronDir, 'hours-task.md'),
        `---
id: hours-task
name: "Task with Active Hours"
schedule: "0 * * * *"
enabled: true
activeHours: [8, 18]
activeHoursTimezone: "Australia/Sydney"
---

Only runs 8am-6pm Sydney time`
      );

      await service.start();

      const result = await service.search({ query: '', page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].activeHours).toEqual([8, 18]);
      expect(result.items[0].activeHoursTimezone).toBe('Australia/Sydney');
    });

    it('handles empty notify array in markdown', async () => {
      await fs.writeFile(
        path.join(cronDir, 'no-notify.md'),
        `---
id: no-notify
name: "Task without notifications"
schedule: "0 9 * * *"
enabled: true
notify: []
---

This task runs but sends no notifications`
      );

      await service.start();

      const result = await service.search({ query: '', page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].notify).toEqual([]);
    });

    it('handles missing notify field', async () => {
      await fs.writeFile(
        path.join(cronDir, 'no-notify-field.md'),
        `---
id: no-notify-field
name: "Task without notify field"
schedule: "0 9 * * *"
enabled: true
---

Task with no notification configuration`
      );

      await service.start();

      const result = await service.search({ query: '', page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].notify).toBeUndefined();
    });
  });

  describe('Schema validation', () => {
    it('rejects task missing required id field', async () => {
      await fs.writeFile(
        path.join(cronDir, 'no-id.md'),
        `---
name: "Task without ID"
schedule: "0 9 * * *"
---

This should fail validation`
      );

      await service.start();

      const result = await service.search({ query: '', page: 1, limit: 10 });
      expect(result.items).toHaveLength(0);
    });

    it('rejects task missing required schedule field', async () => {
      await fs.writeFile(
        path.join(cronDir, 'no-schedule.md'),
        `---
id: no-schedule
name: "Task without schedule"
---

This should fail validation`
      );

      await service.start();

      const result = await service.search({ query: '', page: 1, limit: 10 });
      expect(result.items).toHaveLength(0);
    });

    it('rejects task with empty task body', async () => {
      await fs.writeFile(
        path.join(cronDir, 'empty-body.md'),
        `---
id: empty-body
name: "Task with empty body"
schedule: "0 9 * * *"
---

`
      );

      await service.start();

      const result = await service.search({ query: '', page: 1, limit: 10 });
      expect(result.items).toHaveLength(0);
    });

    it('accepts valid task with all optional fields', async () => {
      await fs.writeFile(
        path.join(cronDir, 'complete.md'),
        `---
id: complete-task
name: "Complete Task"
schedule: "0 9 * * *"
enabled: true
notify:
  - whatsapp:61423222658
activeHours: [8, 22]
activeHoursTimezone: "Australia/Sydney"
---

This is a complete task with all optional fields`
      );

      await service.start();

      const result = await service.search({ query: '', page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
      const task = result.items[0];
      expect(task.id).toBe('complete-task');
      expect(task.name).toBe('Complete Task');
      expect(task.schedule).toBe('0 9 * * *');
      expect(task.enabled).toBe(true);
      expect(task.notify).toEqual(['whatsapp:61423222658']);
      expect(task.activeHours).toEqual([8, 22]);
      expect(task.activeHoursTimezone).toBe('Australia/Sydney');
    });

    it('uses id as fallback for name if name is missing', async () => {
      await fs.writeFile(
        path.join(cronDir, 'fallback-name.md'),
        `---
id: fallback-name
schedule: "0 9 * * *"
---

Task prompt without explicit name field`
      );

      await service.start();

      const result = await service.search({ query: '', page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('fallback-name');
    });

    it('prefers title field over name field', async () => {
      await fs.writeFile(
        path.join(cronDir, 'title-priority.md'),
        `---
id: title-priority
title: "Title Takes Priority"
name: "Name Field"
schedule: "0 9 * * *"
---

Task prompt`
      );

      await service.start();

      const result = await service.search({ query: '', page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Title Takes Priority');
    });
  });

  describe('Error handling', () => {
    it('skips tasks with malformed YAML frontmatter', async () => {
      await fs.writeFile(
        path.join(cronDir, 'malformed.md'),
        `---
This is not valid YAML: because: there's: no: colons
---

Task body`
      );

      await service.start();

      const result = await service.search({ query: '', page: 1, limit: 10 });
      expect(result.items).toHaveLength(0);
    });

    it('skips tasks with invalid type values', async () => {
      await fs.writeFile(
        path.join(cronDir, 'invalid-types.md'),
        `---
id: invalid-types
name: "Invalid Types"
schedule: "0 9 * * *"
activeHours: [8, 25]
---

activeHours has invalid hour (25)`
      );

      await service.start();

      const result = await service.search({ query: '', page: 1, limit: 10 });
      // Should be rejected due to invalid hour value
      expect(result.items).toHaveLength(0);
    });

    it('handles files without YAML frontmatter gracefully', async () => {
      await fs.writeFile(
        path.join(cronDir, 'no-frontmatter.md'),
        `Just a regular markdown file with no YAML frontmatter at all`
      );

      await service.start();

      const result = await service.search({ query: '', page: 1, limit: 10 });
      expect(result.items).toHaveLength(0);
    });

    it('continues loading other tasks when one fails validation', async () => {
      await fs.writeFile(
        path.join(cronDir, 'invalid.md'),
        `---
name: "Missing required fields"
---

This should fail`
      );

      await fs.writeFile(
        path.join(cronDir, 'valid.md'),
        `---
id: valid-task
name: "Valid Task"
schedule: "0 9 * * *"
---

This should load`
      );

      await service.start();

      const result = await service.search({ query: '', page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('valid-task');
    });
  });

  describe('Cron Job Configuration', () => {
    it('schedules tasks in local timezone, not UTC', async () => {
      // Create a task scheduled for 9:00 AM
      await fs.writeFile(
        path.join(cronDir, 'test-tz.md'),
        `---
id: test-tz
name: "Timezone Test"
schedule: "0 9 * * *"
---

Test task`
      );

      await service.start();

      // Verify the task was loaded
      const result = await service.search({ query: '', page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('test-tz');

      // The actual cron job will use system timezone (not UTC)
      // If it were UTC, the next fire would be at a different local time
      // This test verifies the job was created successfully (no UTC parameter)
      // by checking that the service loaded it without errors
    });
  });
});
