import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getFunctionsService } from '../services/functions.service';

/**
 * Tool for executing a specific function
 */
export const executeFunctionTool = createTool({
  id: 'execute-function' as const,
  description: 'Execute a specific Vargos function by its ID with provided parameters',
  inputSchema: z.object({
    functionId: z.string().describe('The ID of the function to execute'),
    params: z.record(z.string(), z.any()).describe('Parameters to pass to the function'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.any(),
    error: z.string().optional(),
  }),
  execute: async ({ context }): Promise<{
    success: boolean;
    result: any;
    error?: string;
  }> => {
    const { functionId, params } = context;

    try {
      const functionsService = await getFunctionsService();
      const result = await functionsService.executeFunction(functionId, params);

      return {
        success: true,
        result,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        result: null,
        error: errorMessage,
      };
    }
  },
});
