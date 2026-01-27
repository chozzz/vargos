/**
 * Memory get tool
 * Safe snippet read from memory files
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from './types.js';
import { getMemoryContext } from '../../services/memory/context.js';

const MemoryGetParameters = z.object({
  path: z.string().describe('Relative path to memory file (e.g., "MEMORY.md" or "daily/2026-02-05.md")'),
  from: z.number().optional().describe('Line number to start from (1-indexed)'),
  lines: z.number().optional().describe('Number of lines to read'),
});

export const memoryGetTool: Tool = {
  name: 'memory_get',
  // Safe snippet read description
  description: 'Safe snippet read from MEMORY.md or memory/*.md with optional from/lines; use after memory_search to pull only the needed lines and keep context small.',
  parameters: MemoryGetParameters,
  execute: async (args: unknown, context: ToolContext) => {
    const params = MemoryGetParameters.parse(args);
    
    try {
      const memory = getMemoryContext();
      const result = await memory.readFile({
        relPath: params.path,
        from: params.from,
        lines: params.lines,
      });
      
      return textResult(`File: ${result.path}\n\n${result.text}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('ENOENT') || message.includes('not found')) {
        return errorResult(`File not found: ${params.path}`);
      }
      return errorResult(`Memory get failed: ${message}`);
    }
  },
};
