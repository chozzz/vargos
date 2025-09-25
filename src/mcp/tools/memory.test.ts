/**
 * Tests for memory tools
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { memorySearchTool } from './memory-search.js';
import { memoryGetTool } from './memory-get.js';
import { ToolContext, getFirstTextContent } from './types.js';
import { initializeServices, closeServices } from '../../services/factory.js';

describe('memory tools', () => {
  let tempDir: string;
  let memoryDir: string;
  let context: ToolContext;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-memory-test-'));
    memoryDir = path.join(tempDir, 'memory');
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    
    // Create memory directory and files
    // Note: fileMemoryDir should point to the memory directory itself
    await fs.mkdir(memoryDir, { recursive: true });
    await fs.writeFile(
      path.join(memoryDir, 'MEMORY.md'),
      '# Test Memory\n\nThis is a test about machine learning and AI.'
    );
    await fs.mkdir(path.join(memoryDir, 'daily'), { recursive: true });
    await fs.writeFile(
      path.join(memoryDir, 'daily', '2026-02-05.md'),
      'Today I worked on the MCP server implementation.'
    );
    
    // Initialize services - fileMemoryDir is the base dir, memory/ is subdirectory
    await initializeServices({
      memory: 'file',
      sessions: 'file',
      fileMemoryDir: tempDir,  // <-- base dir, memory/ and sessions/ subdirs
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

  describe('memory_search', () => {
    it('should find relevant memories', async () => {
      const result = await memorySearchTool.execute({ query: 'machine learning' }, context);

      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('machine learning');
      expect(getFirstTextContent(result.content)).toContain('MEMORY.md');
    });

    it('should find daily notes', async () => {
      const result = await memorySearchTool.execute({ query: 'MCP server' }, context);

      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('MCP server');
    });

    it('should return empty for no matches', async () => {
      const result = await memorySearchTool.execute({ query: 'xyz123nonexistent' }, context);

      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('No relevant memories');
    });

    it('should respect maxResults', async () => {
      // Add more content
      await fs.writeFile(
        path.join(memoryDir, 'extra.md'),
        'Another note about AI and neural networks.\nMore on machine learning algorithms.'
      );
      
      const result = await memorySearchTool.execute({ 
        query: 'machine learning',
        maxResults: 1 
      }, context);

      expect(result.isError).toBeUndefined();
      // Should only show 1 result
      expect(getFirstTextContent(result.content)).not.toContain('[2]');
    });
  });

  describe('memory_get', () => {
    it('should read full memory file', async () => {
      const result = await memoryGetTool.execute({ path: 'MEMORY.md' }, context);

      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('Test Memory');
      expect(getFirstTextContent(result.content)).toContain('machine learning');
    });

    it('should read specific lines', async () => {
      const result = await memoryGetTool.execute({ 
        path: 'MEMORY.md',
        from: 1,
        lines: 1
      }, context);

      expect(result.isError).toBeUndefined();
      expect(getFirstTextContent(result.content)).toContain('# Test Memory');
    });

    it('should return error for non-existent file', async () => {
      const result = await memoryGetTool.execute({ path: 'nonexistent.md' }, context);

      expect(result.isError).toBe(true);
      expect(getFirstTextContent(result.content)).toContain('not found');
    });
  });
});
