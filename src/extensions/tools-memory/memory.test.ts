/**
 * Tests for memory tools
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { memorySearchTool } from './memory-search.js';
import { memoryGetTool } from './memory-get.js';
import { ToolContext, getFirstTextContent } from '../../contracts/tool.js';
import { initializeMemoryContext, getMemoryContext } from '../service-file/memory-context.js';

describe('memory tools', () => {
  let tempDir: string;
  let workspaceDir: string;
  let context: ToolContext;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-memory-test-'));
    workspaceDir = path.join(tempDir, 'workspace');
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;

    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, 'MEMORY.md'),
      '# Test Memory\n\nThis is a test about machine learning and AI.'
    );
    await fs.mkdir(path.join(workspaceDir, 'memory'), { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, 'memory', '2026-02-05.md'),
      'Today I worked on the MCP server implementation.'
    );

    await initializeMemoryContext({
      memoryDir: workspaceDir,
      cacheDir: tempDir,
    });

    context = {
      sessionKey: 'test-session',
      workingDir: workspaceDir,
    };
  });

  afterEach(async () => {
    await getMemoryContext().close();
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
      await fs.writeFile(
        path.join(workspaceDir, 'extra.md'),
        'Another note about AI and neural networks.\nMore on machine learning algorithms.'
      );

      const result = await memorySearchTool.execute({
        query: 'machine learning',
        maxResults: 1
      }, context);

      expect(result.isError).toBeUndefined();
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
