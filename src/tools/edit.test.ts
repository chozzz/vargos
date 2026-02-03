/**
 * Tests for edit tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { editTool } from './edit.js';
import { ToolContext, getFirstTextContent } from './types.js';

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
    expect(getFirstTextContent(result.content)).toContain('Could not find');
  });

  it('should return error if multiple occurrences', async () => {
    await fs.writeFile(path.join(tempDir, 'test.txt'), 'foo bar foo');
    
    const result = await editTool.execute({ 
      path: 'test.txt', 
      oldText: 'foo',
      newText: 'baz'
    }, context);

    expect(result.isError).toBe(true);
    expect(getFirstTextContent(result.content)).toContain('2 occurrences');
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

  it('should resolve ~ to home directory', async () => {
    const home = os.homedir();
    const testFile = path.join(home, 'vargos-edit-tilde-test.txt');
    await fs.writeFile(testFile, 'original');
    const ctx: ToolContext = { sessionKey: 'test', workingDir: home };
    try {
      const result = await editTool.execute(
        { path: '~/vargos-edit-tilde-test.txt', oldText: 'original', newText: 'edited' },
        ctx
      );
      expect(result.isError).toBeUndefined();
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('edited');
    } finally {
      await fs.rm(testFile, { force: true });
    }
  });
});
