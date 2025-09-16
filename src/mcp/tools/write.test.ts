/**
 * Tests for write tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { writeTool } from './write.js';
import { ToolContext } from './types.js';

describe('write tool', () => {
  let tempDir: string;
  let context: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-test-'));
    context = {
      sessionKey: 'test-session',
      workingDir: tempDir,
    };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should write a new file', async () => {
    const content = 'Hello, World!';
    const result = await writeTool.execute({ path: 'test.txt', content }, context);

    expect(result.isError).toBeUndefined();
    
    const fileContent = await fs.readFile(path.join(tempDir, 'test.txt'), 'utf-8');
    expect(fileContent).toBe(content);
  });

  it('should overwrite existing file', async () => {
    await fs.writeFile(path.join(tempDir, 'test.txt'), 'old content');
    
    const newContent = 'new content';
    const result = await writeTool.execute({ path: 'test.txt', content: newContent }, context);

    expect(result.isError).toBeUndefined();
    
    const fileContent = await fs.readFile(path.join(tempDir, 'test.txt'), 'utf-8');
    expect(fileContent).toBe(newContent);
  });

  it('should create nested directories', async () => {
    const result = await writeTool.execute({ 
      path: 'nested/dir/file.txt', 
      content: 'content' 
    }, context);

    expect(result.isError).toBeUndefined();
    
    const fileContent = await fs.readFile(path.join(tempDir, 'nested/dir/file.txt'), 'utf-8');
    expect(fileContent).toBe('content');
  });

  it('should return error for path outside workspace', async () => {
    const result = await writeTool.execute({ 
      path: '/etc/test.txt', 
      content: 'content' 
    }, context);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Access denied');
  });
});
