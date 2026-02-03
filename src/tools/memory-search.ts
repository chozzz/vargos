/**
 * Memory search tool
 * Mandatory recall step with hybrid search
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from './types.js';
import { getMemoryContext } from '../services/memory/context.js';

const MemorySearchParameters = z.object({
  query: z.string().describe('Search query to find relevant memories'),
  maxResults: z.number().optional().describe('Maximum number of results (default: 6)'),
  minScore: z.number().optional().describe('Minimum relevance score 0-1 (default: 0.3)'),
});

export const memorySearchTool: Tool = {
  name: 'memory_search',
  // Mandatory recall description
  description: 'Mandatory recall step: semantically search MEMORY.md + memory/*.md (and optional session transcripts) before answering questions about prior work, decisions, dates, people, preferences, or todos; returns top snippets with path + lines.',
  parameters: MemorySearchParameters,
  execute: async (args: unknown, context: ToolContext) => {
    const params = MemorySearchParameters.parse(args);
    
    try {
      const memory = getMemoryContext();
      const results = await memory.search(params.query, {
        maxResults: params.maxResults,
        minScore: params.minScore,
      });
      
      if (results.length === 0) {
        return textResult('No relevant memories found.');
      }
      
      const formatted = results.map((r, i) => {
        return `[${i + 1}] ${r.citation} (score: ${r.score.toFixed(2)})\n${r.chunk.content.slice(0, 1500)}${r.chunk.content.length > 1500 ? '...' : ''}\n`;
      }).join('\n---\n\n');
      
      const stats = memory.getStats();
      
      return textResult(
        `Found ${results.length} relevant memories (indexed ${stats.chunks} chunks from ${stats.files} files):\n\n${formatted}`,
        { indexedFiles: stats.files, indexedChunks: stats.chunks }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Memory search failed: ${message}`);
    }
  },
};
