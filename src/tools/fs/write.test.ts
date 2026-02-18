/**
 * Tests for write tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { writeTool } from './write.js';
import { ToolContext, getFirstTextContent } from '../types.js';

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

  it('should resolve ~ to home directory', async () => {
    const home = os.homedir();
    const testFile = path.join(home, 'vargos-write-tilde-test.txt');
    const ctx: ToolContext = { sessionKey: 'test', workingDir: home };
    try {
      const result = await writeTool.execute(
        { path: '~/vargos-write-tilde-test.txt', content: 'tilde write ok' },
        ctx
      );
      expect(result.isError).toBeUndefined();
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('tilde write ok');
    } finally {
      await fs.rm(testFile, { force: true });
    }
  });
});
