import { createTool } from '@mastra/core/tools';
import { getCoreServices } from '../../services/core.service';
import { z } from 'zod';

export const setEnvTool = createTool({
  id: 'set-env' as const,
  description: 'Set an environment variable value',

  inputSchema: z.object({
    key: z.string().describe('Environment variable key to set'),
    value: z.string().describe('Value to set for the environment variable'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
  }),

  execute: async ({ context }) => {
    const { key, value } = context;

    try {
      const coreServices = getCoreServices();
      coreServices.envService?.set(key, value);

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
