import { createTool } from '@mastra/core/tools';
import { getCoreServices } from '../../services/core.service';

import { z } from 'zod';

/**
 * Tool for searching functions semantically
 */
export const searchFunctionsTool = createTool({
  id: 'search-functions' as const,
  description: 'Search for Vargos functions using semantic search based on a natural language query',
  inputSchema: z.object({
    query: z.string().describe('Natural language query describing what you need'),
    limit: z.number().optional().default(10).describe('Maximum number of results to return'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    functions: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      category: z.union([z.string(), z.array(z.string())]),
      tags: z.array(z.string()),
      score: z.number(),
    })),
    total: z.number(),
  }),
  execute: async ({ context }): Promise<{
    success: boolean;
    functions: Array<{
      id: string;
      name: string;
      description: string;
      category: string | string[];
      tags: string[];
      score: number;
    }>;
    total: number;
  }> => {
    const { query, limit = 10 } = context;

    try {
      const coreServices = getCoreServices();
      const results = await coreServices.functionsService.searchFunctions(query, limit);

      return {
        success: true,
        functions: results.map((r: any) => ({
          ...r.payload,
          score: r.score,
        })),
        total: results.length,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to search functions: ${errorMessage}`);
    }
  },
});
