import { createTool } from '@mastra/core/tools';
import { getCoreServices } from '../../services/core.service';
import { z } from 'zod';

export const bashInterruptTool = createTool({
  id: 'bash-interrupt' as const,
  description: 'Interrupt a currently running bash command',

  inputSchema: z.object({}),

  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
  }),

  execute: async () => {
    try {
      const coreServices = getCoreServices();
      coreServices.shellService?.interrupt();

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
