import { createTool } from '@mastra/core/tools';
import { getCoreServices } from '../../services/core.service';
import { z } from 'zod';

export const createMemoryCollectionTool = createTool({
  id: 'create-memory-collection' as const,
  description: 'Create a new memory collection (namespace) for storing related memories',

  inputSchema: z.object({
    name: z.string().describe('Name for the memory collection'),
    vectorSize: z.number().optional().default(1536).describe('Vector dimension size (default: 1536 for OpenAI ada-002)'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
  }),

  execute: async ({ context }) => {
    const { name, vectorSize } = context;

    try {
      const coreServices = getCoreServices();

      // Check if collection already exists
      const exists = await coreServices.vectorService.collectionExists(name);
      if (exists) {
        return {
          success: false,
          error: `Collection '${name}' already exists`,
        };
      }

      // Create the collection
      await coreServices.vectorService.createCollection(name, vectorSize);

      return {
        success: true,
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
