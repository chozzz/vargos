/**
 * Tests for read tool - Ported from OpenClaw patterns
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { readTool } from './read.js';
import { ToolContext, getFirstTextContent } from './types.js';

describe('read tool', () => {
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

  it('should read a text file', async () => {
    const content = 'Hello, World!';
    await fs.writeFile(path.join(tempDir, 'test.txt'), content);

    const result = await readTool.execute({ path: 'test.txt' }, context);

    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toEqual({ type: 'text', text: content });
  });

  it('should read file with offset and limit', async () => {
    const lines = ['line 1', 'line 2', 'line 3', 'line 4', 'line 5'];
    await fs.writeFile(path.join(tempDir, 'lines.txt'), lines.join('\n'));

    const result = await readTool.execute({ path: 'lines.txt', offset: 2, limit: 2 }, context);

    expect(getFirstTextContent(result.content)).toBe('line 2\nline 3');
  });

  it('should return error for non-existent file', async () => {
    const result = await readTool.execute({ path: 'nonexistent.txt' }, context);

    expect(result.isError).toBe(true);
    expect(getFirstTextContent(result.content)).toContain('File not found');
  });

  it('should read image file', async () => {
    // Create a minimal PNG
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const pngData = Buffer.concat([pngHeader, Buffer.from('IHDR')]); // Minimal valid PNG start
    await fs.writeFile(path.join(tempDir, 'test.png'), pngData);

    const result = await readTool.execute({ path: 'test.png' }, context);

    expect(result.content[0].type).toBe('image');
  });

  it('should resolve ~ to home directory', async () => {
    const home = os.homedir();
    const testFile = path.join(home, 'vargos-read-tilde-test.txt');
    const content = 'tilde expanded';
    await fs.writeFile(testFile, content);
    try {
      const ctx: ToolContext = { sessionKey: 'test', workingDir: home };
      const result = await readTool.execute({ path: '~/vargos-read-tilde-test.txt' }, ctx);
      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toBe(content);
    } finally {
      await fs.rm(testFile, { force: true });
    }
  });
});
