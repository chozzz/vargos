import { createTool } from '@mastra/core/tools';
import { getCoreServices } from '../../services/core.service';
import { z } from 'zod';

export const searchEnvTool = createTool({
  id: 'search-env' as const,
  description: 'Search for environment variables by keyword',

  inputSchema: z.object({
    keyword: z.string().describe('Keyword to search for in environment variable names'),
    censor: z.boolean().optional().default(false).describe('Whether to censor sensitive values'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    matches: z.record(z.string(), z.string()).optional(),
    error: z.string().optional(),
  }),

  execute: async ({ context }) => {
    const { keyword, censor } = context;

    try {
      const coreServices = getCoreServices();
      const matches = coreServices.envService?.search(keyword, censor);

      return {
        success: true,
        matches: matches || {},
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
