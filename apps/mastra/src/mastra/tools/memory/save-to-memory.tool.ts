import { createTool } from '@mastra/core/tools';
import { getCoreServices } from '../../services/core.service';
import { z } from 'zod';

export const saveToMemoryTool = createTool({
  id: 'save-to-memory' as const,
  description: 'Save text to vector memory for later semantic search and recall',

  inputSchema: z.object({
    collection: z.string().describe('Memory collection name (namespace)'),
    id: z.string().describe('Unique identifier for this memory entry'),
    text: z.string().describe('Text content to remember'),
    metadata: z.record(z.string(), z.any()).optional().describe('Additional metadata to store with the memory'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
  }),

  execute: async ({ context }) => {
    const { collection, id, text, metadata = {} } = context;

    try {
      const coreServices = getCoreServices();

      // Generate embeddings for the text
      const vector = await coreServices.llmService.generateEmbeddings(text);

      // Index to vector database
      await coreServices.vectorService.index({
        collectionName: collection,
        id,
        vector,
        payload: {
          text,
          ...metadata,
        },
      });

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
