/**
 * Memory write tool - Write or append to memory files
 * File watcher in MemoryContext auto-reindexes on changes
 */

import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Tool, ToolContext, textResult, errorResult } from '../types.js';
import { resolveWorkspaceDir } from '../../config/paths.js';

const MemoryWriteParameters = z.object({
  path: z.string().describe('Relative path within memory dir (e.g., "notes/project.md")'),
  content: z.string().describe('Content to write'),
  mode: z.enum(['overwrite', 'append']).optional().default('overwrite').describe('Write mode'),
});

export const memoryWriteTool: Tool = {
  name: 'memory_write',
  description: 'Write or append to a memory file. Changes are auto-indexed for search.',
  parameters: MemoryWriteParameters,
  formatCall: (args) => `${args.mode || 'overwrite'} ${String(args.path || '')}`,
  execute: async (args: unknown, _context: ToolContext) => {
    const params = MemoryWriteParameters.parse(args);
    const memoryDir = resolveWorkspaceDir();

    // Resolve and validate path stays within memoryDir
    const fullPath = path.resolve(memoryDir, params.path);
    if (!fullPath.startsWith(memoryDir + path.sep) && fullPath !== memoryDir) {
      return errorResult('Path traversal denied: path must be within memory directory');
    }

    try {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });

      if (params.mode === 'append') {
        await fs.appendFile(fullPath, params.content, 'utf-8');
      } else {
        await fs.writeFile(fullPath, params.content, 'utf-8');
      }

      return textResult(`Written to ${params.path} (${params.mode})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Failed to write memory file: ${message}`);
    }
  },
};
