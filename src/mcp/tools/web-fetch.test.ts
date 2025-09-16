/**
 * Tests for web_fetch tool
 */

import { describe, it, expect } from 'vitest';
import { webFetchTool } from './web-fetch.js';
import { ToolContext } from './types.js';

describe('web_fetch tool', () => {
  const context: ToolContext = {
    sessionKey: 'test-session',
    workingDir: '/tmp',
  };

  it('should reject invalid URL', async () => {
    const result = await webFetchTool.execute({ url: 'not-a-url' }, context);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid URL');
  });

  it('should reject non-http protocols', async () => {
    const result = await webFetchTool.execute({ url: 'file:///etc/passwd' }, context);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid URL');
  });

  it('should fetch a real URL (markdown mode)', async () => {
    // Using httpbin.org for reliable testing
    const result = await webFetchTool.execute({ 
      url: 'https://httpbin.org/html',
      maxChars: 5000 
    }, context);

    // httpbin returns HTML, so we should get markdown output
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text.length).toBeGreaterThan(0);
  }, 10000);

  it('should fetch a real URL (text mode)', async () => {
    const result = await webFetchTool.execute({ 
      url: 'https://httpbin.org/html',
      extractMode: 'text',
      maxChars: 5000 
    }, context);

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text.length).toBeGreaterThan(0);
  }, 10000);

  it('should respect maxChars limit', async () => {
    const result = await webFetchTool.execute({ 
      url: 'https://httpbin.org/html',
      maxChars: 100 
    }, context);

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text.length).toBeLessThanOrEqual(200); // Buffer for truncation marker and title
    expect(result.content[0].text).toContain('truncated');
  }, 10000);
});
