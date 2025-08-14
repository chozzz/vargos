import { createTool } from '@mastra/core/tools';
import { getCoreServices } from '../../services/core.service';
import { z } from 'zod';

export const bashTool = createTool({
  id: 'bash' as const,
  description: 'Execute bash commands (use cd to change directories)',

  inputSchema: z.object({
    command: z.string().describe('Bash command to execute'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    error: z.string().optional(),
  }),

  execute: async ({ context }) => {
    const { command } = context;

    try {
      const coreServices = getCoreServices();
      const output = await coreServices.shellService?.execute(command);

      return {
        success: true,
        output: output || '',
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        output: '',
        error: errorMessage,
      };
    }
  },
});
