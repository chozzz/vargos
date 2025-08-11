import { createTool } from '@mastra/core/tools';
import { getCoreServices } from '../../services/core.service';

import { z } from 'zod';

/**
 * Tool for listing all available Vargos functions
 */
export const listFunctionsTool = createTool({
  id: 'list-functions' as const,
  description: 'List all available Vargos functions',
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    functions: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      category: z.union([z.string(), z.array(z.string())]),
      tags: z.array(z.string()),
    })),
    total: z.number(),
  }),
  execute: async (): Promise<{
    success: boolean;
    functions: Array<{
      id: string;
      name: string;
      description: string;
      category: string | string[];
      tags: string[];
    }>;
    total: number;
  }> => {
    try {
      const coreServices = getCoreServices();
      const result = await coreServices.functionsService.listFunctions();

      return {
        success: true,
        functions: result.functions,
        total: result.total,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to list functions: ${errorMessage}`);
    }
  },
});
