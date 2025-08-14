import { createTool } from '@mastra/core/tools';
import { getCoreServices } from '../../services/core.service';
import { z } from 'zod';

export const deleteFromMemoryTool = createTool({
  id: 'delete-from-memory' as const,
  description: 'Delete a specific memory entry from a collection',

  inputSchema: z.object({
    collection: z.string().describe('Memory collection name'),
    id: z.string().describe('ID of the memory entry to delete'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
  }),

  execute: async ({ context }) => {
    const { collection, id } = context;

    try {
      const coreServices = getCoreServices();
      await coreServices.vectorService.delete(collection, id);

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
