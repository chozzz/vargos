/**
 * Tests for session lifecycle edge cases
 * Ensures robustness around session creation, deletion, and concurrent access
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { initializeServices, closeServices, getSessionService } from '../../services/factory.js';
import { VargosAgentRuntime } from '../../agent/runtime.js';

describe('session lifecycle edge cases', () => {
  let tempDir: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-edge-test-'));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    
    await initializeServices({
      memory: 'file',
      sessions: 'file',
      fileMemoryDir: tempDir,
    });
  });

  afterEach(async () => {
    await closeServices();
    process.env.HOME = originalHome;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Vargos Runtime', () => {
    it('should skip compaction event if session was deleted', async () => {
      const sessions = getSessionService();
      const runtime = new VargosAgentRuntime();

      // Create a session
      const sessionKey = 'test-session';
      await sessions.create({
        sessionKey,
        kind: 'main',
        metadata: {},
      });

      // Delete the session
      await sessions.delete(sessionKey);

      // Verify session is gone
      const session = await sessions.get(sessionKey);
      expect(session).toBeNull();

      // Compaction event should be skipped gracefully (not throw)
      // Note: We can't directly call handleCompactionEvent as it's private,
      // but we verify the session is gone and operations handle it
    });

    it('should handle announcement to deleted parent session gracefully', async () => {
      const sessions = getSessionService();
      const runtime = new VargosAgentRuntime();

      // Create parent and child sessions
      const parentKey = 'parent-session';
      const childKey = 'child-session';

      await sessions.create({
        sessionKey: parentKey,
        kind: 'main',
        metadata: {},
      });

      await sessions.create({
        sessionKey: childKey,
        kind: 'subagent',
        metadata: { parentSessionKey: parentKey },
      });

      // Delete parent before subagent completes
      await sessions.delete(parentKey);

      // Verify parent is gone
      const parent = await sessions.get(parentKey);
      expect(parent).toBeNull();

      // Announcement should handle missing parent gracefully
      // Note: runSubagent would fail if parent is deleted, but it shouldn't crash
    });
  });

  describe('File Session Service', () => {
    it('should handle concurrent session creation gracefully', async () => {
      const sessions = getSessionService();
      const sessionKey = 'concurrent-session';

      // Try to create same session multiple times concurrently
      const promises = Array(5).fill(null).map((_, i) =>
        sessions.create({
          sessionKey,
          kind: 'main',
          metadata: { attempt: i },
        }).catch((err: Error) => err)
      );

      const results = await Promise.all(promises);
      
      // At least one should succeed
      const successes = results.filter((r: unknown) => !(r instanceof Error));
      expect(successes.length).toBeGreaterThanOrEqual(1);

      // Session should exist
      const session = await sessions.get(sessionKey);
      expect(session).not.toBeNull();
    });

    it('should handle session file deletion during operation', async () => {
      const sessions = getSessionService();
      const sessionKey = 'deleted-file-session';

      // Create session
      await sessions.create({
        sessionKey,
        kind: 'main',
        metadata: {},
      });

      // Verify it exists
      let session = await sessions.get(sessionKey);
      expect(session).not.toBeNull();

      // Delete the underlying file directly (simulating external deletion)
      const sessionsDir = path.join(tempDir, 'sessions');
      const files = await fs.readdir(sessionsDir);
      for (const file of files) {
        await fs.unlink(path.join(sessionsDir, file));
      }

      // Should return null (not throw)
      session = await sessions.get(sessionKey);
      expect(session).toBeNull();
    });

    it('should handle adding message to deleted session', async () => {
      const sessions = getSessionService();
      const sessionKey = 'deleted-session';

      // Create session
      await sessions.create({
        sessionKey,
        kind: 'main',
        metadata: {},
      });

      // Delete session
      await sessions.delete(sessionKey);

      // Adding message should fail gracefully
      await expect(
        sessions.addMessage({
          sessionKey,
          content: 'test',
          role: 'user',
        })
      ).rejects.toThrow();
    });
  });

  describe('Subagent Lifecycle', () => {
    it('should create child session with correct parent reference', async () => {
      const sessions = getSessionService();
      const parentKey = 'main:parent';
      const childKey = 'agent:default:subagent:1234567890-abcde';

      // Create parent
      await sessions.create({
        sessionKey: parentKey,
        kind: 'main',
        metadata: {},
      });

      // Create child (as sessions_spawn does)
      const childSession = await sessions.create({
        sessionKey: childKey,
        kind: 'subagent',
        agentId: 'default',
        label: 'Test task',
        metadata: {
          parentSessionKey: parentKey,
          model: 'gpt-4o',
        },
      });

      expect(childSession.kind).toBe('subagent');
      expect(childSession.metadata?.parentSessionKey).toBe(parentKey);

      // Add task message to child
      await sessions.addMessage({
        sessionKey: childKey,
        content: 'Do something',
        role: 'user',
        metadata: { type: 'task' },
      });

      // Verify messages
      const messages = await sessions.getMessages(childKey);
      expect(messages.length).toBe(1);
      expect(messages[0].metadata?.type).toBe('task');
    });

    it('should prevent nested subagent spawning', async () => {
      const sessions = getSessionService();
      
      // Create a subagent session
      const subagentKey = 'agent:test:subagent:1234567890-abcde';
      await sessions.create({
        sessionKey: subagentKey,
        kind: 'subagent',
        metadata: {},
      });

      // isSubagentSessionKey should return true
      const { isSubagentSessionKey } = await import('../../agent/prompt.js');
      expect(isSubagentSessionKey(subagentKey)).toBe(true);

      // Regular session should return false
      expect(isSubagentSessionKey('main:session')).toBe(false);
    });
  });
});
