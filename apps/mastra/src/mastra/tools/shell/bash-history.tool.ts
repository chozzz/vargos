import { createTool } from '@mastra/core/tools';
import { getCoreServices } from '../../services/core.service';
import { z } from 'zod';

export const bashHistoryTool = createTool({
  id: 'bash-history' as const,
  description: 'Get the history of executed bash commands and their outputs',

  inputSchema: z.object({}),

  outputSchema: z.object({
    success: z.boolean(),
    history: z.array(z.object({
      command: z.string(),
      output: z.string(),
    })),
    error: z.string().optional(),
  }),

  execute: async () => {
    try {
      const coreServices = getCoreServices();
      const history = coreServices.shellService?.getHistory();

      return {
        success: true,
        history: history || [],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        history: [],
        error: errorMessage,
      };
    }
  },
});
