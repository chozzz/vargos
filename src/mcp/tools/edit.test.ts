/**
 * Tests for edit tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { editTool } from './edit.js';
import { ToolContext } from './types.js';

describe('edit tool', () => {
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

  it('should replace text in a file', async () => {
    await fs.writeFile(path.join(tempDir, 'test.txt'), 'Hello, World!');
    
    const result = await editTool.execute({ 
      path: 'test.txt', 
      oldText: 'World',
      newText: 'Universe'
    }, context);

    expect(result.isError).toBeUndefined();
    
    const fileContent = await fs.readFile(path.join(tempDir, 'test.txt'), 'utf-8');
    expect(fileContent).toBe('Hello, Universe!');
  });

  it('should return error if oldText not found', async () => {
    await fs.writeFile(path.join(tempDir, 'test.txt'), 'Hello, World!');
    
    const result = await editTool.execute({ 
      path: 'test.txt', 
      oldText: 'NonExistent',
      newText: 'Replacement'
    }, context);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Could not find');
  });

  it('should return error if multiple occurrences', async () => {
    await fs.writeFile(path.join(tempDir, 'test.txt'), 'foo bar foo');
    
    const result = await editTool.execute({ 
      path: 'test.txt', 
      oldText: 'foo',
      newText: 'baz'
    }, context);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('2 occurrences');
  });

  it('should return error for path outside workspace', async () => {
    const result = await editTool.execute({ 
      path: '/etc/passwd',
      oldText: 'foo',
      newText: 'bar'
    }, context);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Access denied');
  });

  it('should handle multi-line replacements', async () => {
    const original = 'line1\nline2\nline3';
    await fs.writeFile(path.join(tempDir, 'test.txt'), original);
    
    const result = await editTool.execute({ 
      path: 'test.txt', 
      oldText: 'line2',
      newText: 'newLine2\nnewLine2.5'
    }, context);

    expect(result.isError).toBeUndefined();
    
    const fileContent = await fs.readFile(path.join(tempDir, 'test.txt'), 'utf-8');
    expect(fileContent).toBe('line1\nnewLine2\nnewLine2.5\nline3');
  });
});
