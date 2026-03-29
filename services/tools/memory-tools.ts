/**
 * Memory tools: memory_search, memory_get, memory_write
 * Use the MemoryContext singleton — no bus calls.
 */

import { z } from 'zod';
import type { Tool, ToolResult } from './types.js';
import { textResult, errorResult } from './types.js';
import { toMessage } from '../../lib/error.js';
import { getMemoryContext } from '../memory/index.js';

export const memorySearchTool: Tool = {
  name: 'memory_search',
  description: 'Mandatory recall step: search workspace memory (MEMORY.md + memory/*.md) before answering questions about prior work, decisions, dates, preferences, or todos.',
  parameters: z.object({
    query:      z.string().describe('Search query'),
    maxResults: z.number().optional().describe('Max results (default 6)'),
    minScore:   z.number().optional().describe('Min relevance score 0-1 (default 0.3)'),
  }),
  formatCall: (args) => String(args.query || '').slice(0, 80),
  async execute(args: unknown): Promise<ToolResult> {
    const p = (z.object({ query: z.string(), maxResults: z.number().optional(), minScore: z.number().optional() })).parse(args);
    try {
      const ctx     = getMemoryContext();
      const results = await ctx.search(p.query, { maxResults: p.maxResults, minScore: p.minScore });
      if (results.length === 0) return textResult('No relevant memories found.');

      const stats     = ctx.getStats();
      const formatted = results.map((r, i) =>
        `[${i + 1}] ${r.citation} (score: ${r.score.toFixed(2)})\n${r.chunk.content.slice(0, 1500)}${r.chunk.content.length > 1500 ? '...' : ''}`,
      ).join('\n---\n\n');

      return textResult(
        `Found ${results.length} results (${stats.chunks} chunks from ${stats.files} files):\n\n${formatted}`,
        { indexedFiles: stats.files, indexedChunks: stats.chunks },
      );
    } catch (err) {
      return errorResult(`memory_search failed: ${toMessage(err)}`);
    }
  },
};

export const memoryGetTool: Tool = {
  name: 'memory_get',
  description: 'Read a specific file from the workspace memory directory.',
  parameters: z.object({
    path:  z.string().describe('Relative path within workspace'),
    from:  z.number().optional().describe('Start line (1-based)'),
    lines: z.number().optional().describe('Number of lines to read'),
  }),
  formatCall: (args) => String(args.path || ''),
  async execute(args: unknown): Promise<ToolResult> {
    const p = (z.object({ path: z.string(), from: z.number().optional(), lines: z.number().optional() })).parse(args);
    try {
      const result = await getMemoryContext().readFile({ relPath: p.path, from: p.from, lines: p.lines });
      return textResult(result.text);
    } catch (err) {
      return errorResult(`memory_get failed: ${toMessage(err)}`);
    }
  },
};

export const memoryWriteTool: Tool = {
  name: 'memory_write',
  description: 'Write or append to a file in the workspace memory directory.',
  parameters: z.object({
    path:    z.string().describe('Relative path within workspace'),
    content: z.string().describe('Content to write'),
    mode:    z.enum(['overwrite', 'append']).optional().describe('Default: overwrite'),
  }),
  formatCall: (args) => String(args.path || ''),
  async execute(args: unknown): Promise<ToolResult> {
    const p = (z.object({ path: z.string(), content: z.string(), mode: z.enum(['overwrite', 'append']).optional() })).parse(args);
    try {
      await getMemoryContext().writeFile(p.path, p.content, p.mode ?? 'overwrite');
      return textResult(`Written to ${p.path}`);
    } catch (err) {
      return errorResult(`memory_write failed: ${toMessage(err)}`);
    }
  },
};
