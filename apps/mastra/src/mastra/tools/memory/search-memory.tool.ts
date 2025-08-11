import { createTool } from '@mastra/core/tools';
import { getCoreServices } from '../../services/core.service';
import { z } from 'zod';

export const searchMemoryTool = createTool({
  id: 'search-memory' as const,
  description: 'Search vector memory using semantic similarity to recall relevant information',

  inputSchema: z.object({
    collection: z.string().describe('Memory collection name to search'),
    query: z.string().describe('Search query text'),
    limit: z.number().optional().default(10).describe('Maximum number of results to return'),
    threshold: z.number().optional().describe('Minimum similarity score (0-1) for results'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    results: z.array(z.object({
      id: z.string(),
      score: z.number(),
      text: z.string(),
      metadata: z.record(z.string(), z.any()).optional(),
    })).optional(),
    error: z.string().optional(),
  }),

  execute: async ({ context }) => {
    const { collection, query, limit, threshold } = context;

    try {
      const coreServices = getCoreServices();

      // Search using the vector service (it handles embedding generation internally)
      const searchResults = await coreServices.vectorService.search(query, {
        collectionName: collection,
        limit,
        threshold,
      });

      // Format results
      const results = searchResults.map(result => ({
        id: result.id,
        score: result.score,
        text: result.payload.text as string,
        metadata: { ...result.payload, text: undefined }, // Exclude text from metadata
      }));

      return {
        success: true,
        results,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
});
