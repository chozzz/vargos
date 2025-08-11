import { createTool } from '@mastra/core/tools';
import { getCoreServices } from '../../services/core.service';

import { z } from 'zod';

/**
 * Tool for getting metadata about a specific function
 */
export const getFunctionMetadataTool = createTool({
  id: 'get-function-metadata' as const,
  description: 'Get detailed metadata about a specific Vargos function',
  inputSchema: z.object({
    functionId: z.string().describe('The ID of the function'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    metadata: z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      category: z.union([z.string(), z.array(z.string())]),
      tags: z.array(z.string()),
      requiredEnvVars: z.array(z.string()),
      input: z.array(z.any()),
      output: z.array(z.any()),
    }).optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }): Promise<{
    success: boolean;
    metadata?: any;
    error?: string;
  }> => {
    const { functionId } = context;

    try {
      const coreServices = getCoreServices();
      const metadata = await coreServices.functionsService.getFunctionMetadata(functionId);

      return {
        success: true,
        metadata,
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
