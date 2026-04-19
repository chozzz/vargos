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
});
