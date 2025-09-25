/**
 * Tests for session tools
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { sessionsListTool } from './sessions-list.js';
import { sessionsSendTool } from './sessions-send.js';
import { sessionsSpawnTool } from './sessions-spawn.js';
import { ToolContext, getFirstTextContent } from './types.js';
import { initializeServices, closeServices } from '../../services/factory.js';

describe('session tools', () => {
  let tempDir: string;
  let context: ToolContext;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-session-test-'));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    
    // Initialize services
    await initializeServices({
      memory: 'file',
      sessions: 'file',
      fileMemoryDir: tempDir,
    });
    
    context = {
      sessionKey: 'test-session',
      workingDir: tempDir,
    };
  });

  afterEach(async () => {
    await closeServices();
    process.env.HOME = originalHome;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('sessions_list', () => {
    it('should return empty when no sessions', async () => {
      const result = await sessionsListTool.execute({}, context);

      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('No sessions');
    });

    it('should list created sessions', async () => {
      // First send a message to create a session
      await sessionsSendTool.execute({ 
        sessionKey: 'session-1', 
        message: 'Hello' 
      }, context);

      const result = await sessionsListTool.execute({}, context);

      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('session-1');
    });

    it('should respect limit', async () => {
      await sessionsSendTool.execute({ sessionKey: 'session-a', message: 'A' }, context);
      await sessionsSendTool.execute({ sessionKey: 'session-b', message: 'B' }, context);
      await sessionsSendTool.execute({ sessionKey: 'session-c', message: 'C' }, context);

      const result = await sessionsListTool.execute({ limit: 2 }, context);

      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('Found 2 sessions');
    });
  });

  describe('sessions_send', () => {
    it('should send message to existing session', async () => {
      const result = await sessionsSendTool.execute({ 
        sessionKey: 'my-session', 
        message: 'Test message' 
      }, context);

      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('Message sent');
    });

    it('should create session if not exists', async () => {
      await sessionsSendTool.execute({ 
        sessionKey: 'new-session', 
        message: 'Hello' 
      }, context);

      const listResult = await sessionsListTool.execute({}, context);
      expect(getFirstTextContent(listResult.content)).toContain('new-session');
    });
  });

  describe('sessions_spawn', () => {
    it('should spawn sub-agent session', async () => {
      const result = await sessionsSpawnTool.execute({ 
        task: 'Analyze codebase for bugs',
        label: 'bug-hunter'
      }, context);

      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('Spawned');
      expect(getFirstTextContent(result.content)).toContain('Analyze codebase for bugs');
    });
  });
});
