import { createTool } from '@mastra/core/tools';
import { getCoreServices } from '../../services/core.service';
import { z } from 'zod';

export const getEnvTool = createTool({
  id: 'get-env' as const,
  description: 'Get the value of an environment variable',

  inputSchema: z.object({
    key: z.string().describe('Environment variable key to retrieve'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    value: z.string().optional(),
  }),

  execute: async ({ context }) => {
    const { key } = context;

    try {
      const coreServices = getCoreServices();
      const value = coreServices.envService?.get(key);

      return {
        success: true,
        value,
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
