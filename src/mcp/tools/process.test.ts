/**
 * Tests for process tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProcessTool } from './process.js';
import { ToolContext, getFirstTextContent } from '../../core/tools/types.js';
import { getProcessService } from '../../services/process.js';

describe('process tool', () => {
  let tool: ProcessTool;
  let context: ToolContext;

  beforeEach(() => {
    tool = new ProcessTool();
    context = {
      sessionKey: 'test-session',
      workingDir: '/tmp',
    };
  });

  afterEach(() => {
    // Clean up any running processes
    const service = getProcessService();
    for (const session of service.listRunning()) {
      service.killSession(session.id, 'SIGKILL');
    }
  });

  describe('list action', () => {
    it('should return empty when no sessions', async () => {
      const result = await tool.executeImpl({ action: 'list' }, context);
      
      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('No running');
    });
  });

  describe('lifecycle', () => {
    it('should track process lifecycle', async () => {
      const service = getProcessService();
      
      // Create a session
      const session = service.createSession('echo "hello"', { cwd: '/tmp' });
      
      // List should show it
      const listResult = await tool.executeImpl({ action: 'list' }, context);
      expect(getFirstTextContent(listResult.content)).toContain(session.id);
      expect(getFirstTextContent(listResult.content)).toContain('running');
      
      // Poll should show output
      await new Promise(resolve => setTimeout(resolve, 100));
      const pollResult = await tool.executeImpl({ 
        action: 'poll', 
        sessionId: session.id 
      }, context);
      expect(getFirstTextContent(pollResult.content)).toContain('hello');
      
      // Kill it
      const killResult = await tool.executeImpl({ 
        action: 'kill', 
        sessionId: session.id 
      }, context);
      expect(killResult.isError).toBeUndefined();
    });

    it('should reject invalid sessionId', async () => {
      const result = await tool.executeImpl({ 
        action: 'poll', 
        sessionId: 'nonexistent' 
      }, context);
      
      expect(result.isError).toBe(true);
    });

    it('should require sessionId for actions that need it', async () => {
      const result = await tool.executeImpl({ 
        action: 'kill' 
      }, context);
      
      expect(result.isError).toBe(true);
      expect(getFirstTextContent(result.content)).toContain('sessionId required');
    });
  });

  describe('send-keys', () => {
    it('should send keys to interactive process', async () => {
      const service = getProcessService();
      // Start a process that waits for input
      const session = service.createSession('read -r line && echo "got: $line"', { cwd: '/tmp' });
      
      // Give it time to start
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Send input
      const result = await tool.executeImpl({ 
        action: 'send-keys', 
        sessionId: session.id,
        keys: ['h', 'i', 'Enter']
      }, context);
      
      expect(result.isError).toBeUndefined();
      
      // Wait for output
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Poll to see result
      const pollResult = await tool.executeImpl({ 
        action: 'poll', 
        sessionId: session.id 
      }, context);
      
      // Process is running but we can check it's working
      expect(pollResult.metadata?.status).toBe('running');
    });
  });

  describe('write', () => {
    it('should write to stdin', async () => {
      const service = getProcessService();
      const session = service.createSession('cat', { cwd: '/tmp' });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const result = await tool.executeImpl({ 
        action: 'write', 
        sessionId: session.id,
        data: 'hello world'
      }, context);
      
      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('Wrote');
    });
  });

  describe('remove', () => {
    it('should remove finished sessions', async () => {
      const service = getProcessService();
      const session = service.createSession('echo "done"', { cwd: '/tmp' });
      
      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const result = await tool.executeImpl({ 
        action: 'remove', 
        sessionId: session.id 
      }, context);
      
      expect(result.isError).toBeUndefined();
      
      // Should no longer exist
      const pollResult = await tool.executeImpl({ 
        action: 'poll', 
        sessionId: session.id 
      }, context);
      expect(pollResult.isError).toBe(true);
    });
  });
});
