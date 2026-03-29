import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitterBus } from '../../../../gateway/emitter.js';
import { SessionsService } from '../../index.js';

describe('SessionsService E2E', () => {
  let bus: EventEmitterBus;
  let service: SessionsService;
  let tempDir: string;

  beforeEach(async () => {
    bus = new EventEmitterBus();
    tempDir = path.join(os.tmpdir(), `sessions-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    service = new SessionsService();
    bus.registerService(service);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('session lifecycle', () => {
    it('creates a session', async () => {
      await bus.call('session.create', {
        sessionKey: 'test:e2e',
        metadata: { test: true },
      });

      const session = await bus.call('session.get', { sessionKey: 'test:e2e' });
      expect(session.sessionKey).toBe('test:e2e');
      expect(session.kind).toBe('main');
      expect(session.metadata.test).toBe(true);
    });

    it('adds and retrieves messages', async () => {
      const sessionKey = `test:messages:${Date.now()}`;
      await bus.call('session.create', { sessionKey });

      await bus.call('session.addMessage', {
        sessionKey,
        role: 'user',
        content: 'Hello',
      });

      await bus.call('session.addMessage', {
        sessionKey,
        role: 'assistant',
        content: 'Hi there',
      });

      const messages = await bus.call('session.getMessages', {
        sessionKey,
      });

      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Hello');
      expect(messages[1].content).toBe('Hi there');
    });

    it('searches sessions', async () => {
      await bus.call('session.create', { sessionKey: 'test:search:1' });
      await bus.call('session.create', { sessionKey: 'test:search:2' });

      const result = await bus.call('session.search', {
        query: 'search',
        page: 1,
        limit: 10,
      });

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      expect(result.items.some(s => s.sessionKey === 'test:search:1')).toBe(true);
      expect(result.items.some(s => s.sessionKey === 'test:search:2')).toBe(true);
    });

    it('deletes a session', async () => {
      await bus.call('session.create', { sessionKey: 'test:delete' });
      await bus.call('session.delete', { sessionKey: 'test:delete' });

      try {
        await bus.call('session.get', { sessionKey: 'test:delete' });
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('not found');
      }
    });
  });

  describe('message compaction', () => {
    it('compacts old messages', async () => {
      const sessionKey = `test:compact:${Date.now()}`;
      await bus.call('session.create', { sessionKey });

      for (let i = 0; i < 5; i++) {
        await bus.call('session.addMessage', {
          sessionKey,
          role: 'user',
          content: `Message ${i}`,
        });
      }

      const before = await bus.call('session.getMessages', {
        sessionKey,
      });
      expect(before).toHaveLength(5);

      await bus.call('session.compact', {
        sessionKey,
        count: 2,
      });

      const after = await bus.call('session.getMessages', {
        sessionKey,
      });
      expect(after.length).toBeLessThan(5);
    });
  });
});
