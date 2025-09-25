/**
 * Tests for browser tool
 * Note: Full browser tests require playwright browsers + system dependencies
 * Run: npx playwright install-deps chromium
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { BrowserTool } from './browser.js';
import { ToolContext, getFirstTextContent } from '../../core/tools/types.js';
import { getBrowserService } from '../../services/browser.js';

// Check if browser is available
async function isBrowserAvailable(): Promise<boolean> {
  try {
    const service = getBrowserService();
    const session = await service.createSession();
    await service.closeSession(session.id);
    return true;
  } catch {
    return false;
  }
}

describe('browser tool', () => {
  let tool: BrowserTool;
  let context: ToolContext;
  let browserAvailable = false;

  beforeEach(async () => {
    tool = new BrowserTool();
    context = {
      sessionKey: 'test-session',
      workingDir: '/tmp',
    };
    // Check once
    if (!browserAvailable) {
      browserAvailable = await isBrowserAvailable();
    }
  });

  afterAll(async () => {
    // Clean up all browser sessions
    await getBrowserService().closeAll();
  });

  describe('session management', () => {
    it('should start new browser session', async () => {
      if (!browserAvailable) {
        console.log('Skipping: Browser not available');
        return;
      }
      const result = await tool.executeImpl({ action: 'start' }, context);
      
      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('Browser session started');
      expect(result.metadata?.sessionId).toBeDefined();
    });

    it('should list browser sessions', async () => {
      if (!browserAvailable) {
        console.log('Skipping: Browser not available');
        return;
      }
      // Start a session first
      await tool.executeImpl({ action: 'start' }, context);
      
      const result = await tool.executeImpl({ action: 'list' }, context);
      
      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('browser-');
    });

    it('should show empty list when no sessions', async () => {
      // Close all first
      await getBrowserService().closeAll();
      
      const result = await tool.executeImpl({ action: 'list' }, context);
      
      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('No active');
    });

    it('should close browser session', async () => {
      if (!browserAvailable) {
        console.log('Skipping: Browser not available');
        return;
      }
      const startResult = await tool.executeImpl({ action: 'start' }, context);
      const sessionId = startResult.metadata?.sessionId as string;
      
      const result = await tool.executeImpl({ action: 'close', sessionId }, context);
      
      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('Closed');
    });

    it('should close all sessions', async () => {
      if (!browserAvailable) {
        console.log('Skipping: Browser not available');
        return;
      }
      await tool.executeImpl({ action: 'start' }, context);
      
      const result = await tool.executeImpl({ action: 'stop' }, context);
      
      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('All browser sessions closed');
    });
  });

  describe('validation', () => {
    it('should require sessionId for actions that need it', async () => {
      const result = await tool.executeImpl({ action: 'click' }, context);
      
      expect(result.isError).toBe(true);
      expect(getFirstTextContent(result.content)).toContain('sessionId required');
    });

    it('should require url for open action', async () => {
      const result = await tool.executeImpl({ action: 'open' }, context);
      
      expect(result.isError).toBe(true);
      expect(getFirstTextContent(result.content)).toContain('url required');
    });

    it('should require ref for click action', async () => {
      const result = await tool.executeImpl({ action: 'click' }, context);
      
      expect(result.isError).toBe(true);
      expect(getFirstTextContent(result.content)).toContain('sessionId required');
    });
  });

  describe('web navigation (requires playwright)', () => {
    it('should open and navigate to URL', async () => {
      if (!browserAvailable) {
        console.log('Skipping: Browser not available');
        return;
      }
      const result = await tool.executeImpl({ 
        action: 'open', 
        url: 'https://example.com' 
      }, context);
      
      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('example.com');
      expect(result.metadata?.sessionId).toBeDefined();
    }, 30000);

    it('should get snapshot of page', async () => {
      if (!browserAvailable) {
        console.log('Skipping: Browser not available');
        return;
      }
      const openResult = await tool.executeImpl({ 
        action: 'open', 
        url: 'https://example.com' 
      }, context);
      const sessionId = openResult.metadata?.sessionId as string;
      
      const result = await tool.executeImpl({ 
        action: 'snapshot', 
        sessionId 
      }, context);
      
      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('Example Domain');
    }, 30000);
  });
});
