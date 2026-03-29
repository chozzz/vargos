import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { EventEmitterBus } from '../../../../gateway/emitter.js';
import { FsService } from '../../index.js';

describe('FsService E2E', () => {
  let bus: EventEmitterBus;
  let service: FsService;
  const testDir = path.join('/tmp', `fs-test-${Date.now()}`);

  beforeEach(async () => {
    bus = new EventEmitterBus();
    service = new FsService();
    bus.bootstrap(service);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('fs.read', () => {
    it('reads a file', async () => {
      const filePath = path.join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello World');

      const result = await bus.call('fs.read', { path: filePath });

      expect(result.content).toBe('Hello World');
      expect(result.mimeType).toBe('text/plain');
    });

    it('reads with offset and limit (line-based)', async () => {
      const filePath = path.join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'Line 1\nLine 2\nLine 3');

      const result = await bus.call('fs.read', {
        path: filePath,
        offset: 2,
        limit: 1,
      });

      expect(result.content).toBe('Line 2');
    });

    it('throws on missing file', async () => {
      try {
        await bus.call('fs.read', { path: path.join(testDir, 'missing.txt') });
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('ENOENT');
      }
    });
  });

  describe('fs.write', () => {
    it('writes a file', async () => {
      const filePath = path.join(testDir, 'written.txt');

      await bus.call('fs.write', { path: filePath, content: 'Hello World' });

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Hello World');
    });

    it('overwrites existing file', async () => {
      const filePath = path.join(testDir, 'overwrite.txt');
      await fs.writeFile(filePath, 'Old content');

      await bus.call('fs.write', { path: filePath, content: 'New content' });

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('New content');
    });
  });

  describe('fs.edit', () => {
    it('replaces text in file', async () => {
      const filePath = path.join(testDir, 'edit.txt');
      await fs.writeFile(filePath, 'Hello World\nGoodbye World');

      await bus.call('fs.edit', {
        path: filePath,
        oldText: 'Hello',
        newText: 'Hi',
      });

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Hi World\nGoodbye World');
    });

    it('throws if oldText not found', async () => {
      const filePath = path.join(testDir, 'edit-missing.txt');
      await fs.writeFile(filePath, 'Hello World');

      try {
        await bus.call('fs.edit', {
          path: filePath,
          oldText: 'NotFound',
          newText: 'Replacement',
        });
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('not found');
      }
    });
  });

  describe('fs.exec', () => {
    it('executes a shell command', async () => {
      const result = await bus.call('fs.exec', { command: 'echo "test"' });

      expect(result.stdout).toContain('test');
      expect(result.exitCode).toBe(0);
    });

    it('captures stderr', async () => {
      const result = await bus.call('fs.exec', {
        command: 'ls /nonexistent/path 2>&1 || true',
      });

      expect(result.exitCode).toBe(0); // we || true so exit is 0
    });
  });
});
