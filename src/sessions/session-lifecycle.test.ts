/**
 * Tests for session lifecycle edge cases
 * Ensures robustness around session creation, deletion, and concurrent access
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { FileSessionService } from './file-store.js';
import type { ISessionService } from './types.js';

describe('session lifecycle edge cases', () => {
  let tempDir: string;
  let sessions: ISessionService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-edge-test-'));
    sessions = new FileSessionService({ baseDir: tempDir });
    await (sessions as FileSessionService).initialize();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('File Session Service', () => {
    it('should handle session create and delete', async () => {
      const sessionKey = 'test-session';
      await sessions.create({ sessionKey, kind: 'main', metadata: {} });

      let session = await sessions.get(sessionKey);
      expect(session).not.toBeNull();

      await sessions.delete(sessionKey);
      session = await sessions.get(sessionKey);
      expect(session).toBeNull();
    });

    it('should handle concurrent session creation gracefully', async () => {
      const sessionKey = 'concurrent-session';

      const promises = Array(5).fill(null).map((_, i) =>
        sessions.create({
          sessionKey,
          kind: 'main',
          metadata: { attempt: i },
        }).catch((err: Error) => err)
      );

      const results = await Promise.all(promises);

      const successes = results.filter((r: unknown) => !(r instanceof Error));
      expect(successes.length).toBeGreaterThanOrEqual(1);

      const session = await sessions.get(sessionKey);
      expect(session).not.toBeNull();
    });

    it('should handle session file deletion during operation', async () => {
      const sessionKey = 'deleted-file-session';
      await sessions.create({ sessionKey, kind: 'main', metadata: {} });

      let session = await sessions.get(sessionKey);
      expect(session).not.toBeNull();

      // Delete the underlying files directly
      const sessionsDir = path.join(tempDir, 'sessions');
      await fs.rm(sessionsDir, { recursive: true, force: true });
      await fs.mkdir(sessionsDir, { recursive: true });

      session = await sessions.get(sessionKey);
      expect(session).toBeNull();
    });

    it('should handle adding message to deleted session', async () => {
      const sessionKey = 'deleted-session';
      await sessions.create({ sessionKey, kind: 'main', metadata: {} });
      await sessions.delete(sessionKey);

      await expect(
        sessions.addMessage({ sessionKey, content: 'test', role: 'user' })
      ).rejects.toThrow();
    });
  });

  describe('Session history loading', () => {
    it('should load full message history with correct roles and count', async () => {
      const sessionKey = 'whatsapp:61400000000';
      await sessions.create({ sessionKey, kind: 'main', metadata: { channel: 'whatsapp' } });

      await sessions.addMessage({ sessionKey, content: 'Hello', role: 'user', metadata: { type: 'task' } });
      await sessions.addMessage({ sessionKey, content: 'Hi there!', role: 'assistant' });
      await sessions.addMessage({ sessionKey, content: 'Do the thing', role: 'user', metadata: { type: 'task' } });
      await sessions.addMessage({ sessionKey, content: 'Done.', role: 'assistant' });
      await sessions.addMessage({ sessionKey, content: 'Thanks', role: 'user', metadata: { type: 'task' } });

      const messages = await sessions.getMessages(sessionKey);
      expect(messages).toHaveLength(5);

      const userMessages = messages.filter(m => m.role === 'user');
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      expect(userMessages).toHaveLength(3);
      expect(assistantMessages).toHaveLength(2);

      // All contents present
      const contents = messages.map(m => m.content);
      expect(contents).toContain('Hello');
      expect(contents).toContain('Hi there!');
      expect(contents).toContain('Do the thing');
      expect(contents).toContain('Done.');
      expect(contents).toContain('Thanks');

      // User messages carry metadata
      for (const msg of userMessages) {
        expect(msg.metadata?.type).toBe('task');
      }
    });

    it('should not wipe history when create is called on existing session', async () => {
      const sessionKey = 'whatsapp:61400000001';
      await sessions.create({ sessionKey, kind: 'main', metadata: {} });
      await sessions.addMessage({ sessionKey, content: 'First', role: 'user' });
      await sessions.addMessage({ sessionKey, content: 'Second', role: 'user' });

      // Simulate channel service calling create again on next inbound message
      await sessions.create({ sessionKey, kind: 'main', metadata: {} }).catch(() => {});

      const messages = await sessions.getMessages(sessionKey);
      expect(messages).toHaveLength(2);
      const contents = messages.map(m => m.content);
      expect(contents).toContain('First');
      expect(contents).toContain('Second');
    });
  });

  describe('Subagent Lifecycle', () => {
    it('should create child session with correct parent reference', async () => {
      const parentKey = 'main:parent';
      const childKey = 'agent:default:subagent:1234567890-abcde';

      await sessions.create({ sessionKey: parentKey, kind: 'main', metadata: {} });

      const childSession = await sessions.create({
        sessionKey: childKey,
        kind: 'subagent',
        agentId: 'default',
        label: 'Test task',
        metadata: { parentSessionKey: parentKey, model: 'gpt-4o' },
      });

      expect(childSession.kind).toBe('subagent');
      expect(childSession.metadata?.parentSessionKey).toBe(parentKey);

      await sessions.addMessage({
        sessionKey: childKey,
        content: 'Do something',
        role: 'user',
        metadata: { type: 'task' },
      });

      const messages = await sessions.getMessages(childKey);
      expect(messages.length).toBe(1);
      expect(messages[0].metadata?.type).toBe('task');
    });

    it('should prevent nested subagent spawning', async () => {
      const subagentKey = 'agent:test:subagent:1234567890-abcde';
      await sessions.create({ sessionKey: subagentKey, kind: 'subagent', metadata: {} });

      const { isSubagentSessionKey } = await import('./keys.js');
      expect(isSubagentSessionKey(subagentKey)).toBe(true);
      expect(isSubagentSessionKey('main:session')).toBe(false);
    });
  });
});
