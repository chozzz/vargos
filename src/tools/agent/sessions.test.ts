/**
 * Tests for session tools — uses mocked context.call() (gateway RPC)
 */

import { describe, it, expect, vi } from 'vitest';
import { sessionsListTool } from './sessions-list.js';
import { sessionsSendTool } from './sessions-send.js';
import { sessionsSpawnTool } from './sessions-spawn.js';
import { ToolContext, getFirstTextContent } from '../types.js';

// In-memory session store for mocking
function createMockContext(sessionKey = 'test-session'): ToolContext {
  const sessions = new Map<string, { sessionKey: string; kind: string; label?: string; updatedAt: string }>();
  const messages = new Map<string, Array<{ content: string; role: string; timestamp: number; metadata?: any }>>();

  const call = vi.fn(async (target: string, method: string, params?: any) => {
    if (target === 'sessions') {
      switch (method) {
        case 'session.list': {
          let list = [...sessions.values()];
          if (params?.kind) list = list.filter(s => s.kind === params.kind);
          if (params?.limit) list = list.slice(0, params.limit);
          return list;
        }
        case 'session.get':
          return sessions.get(params.sessionKey) ?? null;
        case 'session.create': {
          const s = { ...params, updatedAt: new Date().toISOString() };
          sessions.set(params.sessionKey, s);
          return s;
        }
        case 'session.addMessage': {
          const msgs = messages.get(params.sessionKey) ?? [];
          msgs.push({ content: params.content, role: params.role, timestamp: Date.now(), metadata: params.metadata });
          messages.set(params.sessionKey, msgs);
          return {};
        }
        case 'session.getMessages':
          return messages.get(params.sessionKey) ?? [];
      }
    }
    if (target === 'agent' && method === 'agent.run') {
      return { success: true, response: 'done' };
    }
    throw new Error(`Unknown: ${target}.${method}`);
  });

  return { sessionKey, workingDir: '/tmp', call };
}

describe('session tools', () => {
  describe('sessions_list', () => {
    it('should return empty when no sessions', async () => {
      const ctx = createMockContext();
      const result = await sessionsListTool.execute({}, ctx);
      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('No sessions');
    });

    it('should list created sessions', async () => {
      const ctx = createMockContext();
      await sessionsSendTool.execute({ sessionKey: 'session-1', message: 'Hello' }, ctx);

      const result = await sessionsListTool.execute({}, ctx);
      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('session-1');
    });

    it('should respect limit', async () => {
      const ctx = createMockContext();
      await sessionsSendTool.execute({ sessionKey: 'session-a', message: 'A' }, ctx);
      await sessionsSendTool.execute({ sessionKey: 'session-b', message: 'B' }, ctx);
      await sessionsSendTool.execute({ sessionKey: 'session-c', message: 'C' }, ctx);

      const result = await sessionsListTool.execute({ limit: 2 }, ctx);
      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('Found 2 sessions');
    });
  });

  describe('sessions_send', () => {
    it('should send message to existing session', async () => {
      const ctx = createMockContext();
      const result = await sessionsSendTool.execute({
        sessionKey: 'my-session', message: 'Test message',
      }, ctx);
      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('Message sent');
    });

    it('should create session if not exists', async () => {
      const ctx = createMockContext();
      await sessionsSendTool.execute({ sessionKey: 'new-session', message: 'Hello' }, ctx);
      const listResult = await sessionsListTool.execute({}, ctx);
      expect(getFirstTextContent(listResult.content)).toContain('new-session');
    });
  });

  describe('sessions_spawn', () => {
    it('should spawn sub-agent session', async () => {
      const ctx = createMockContext();
      const result = await sessionsSpawnTool.execute({
        task: 'Analyze codebase for bugs', label: 'bug-hunter',
      }, ctx);
      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('Spawned');
      expect(getFirstTextContent(result.content)).toContain('Analyze codebase for bugs');
    });
  });
});
