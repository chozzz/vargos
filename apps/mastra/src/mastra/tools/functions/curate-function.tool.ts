// apps/mastra/src/mastra/tools/curate-function.tool.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { curateFunctionWorkflow } from '../../workflows/curate-function-workflow';

export const curateFunctionTool = createTool({
  id: 'curate-function' as const,
  description: 'Create, edit, fix, or optimize a function with AI assistance. Only use after user confirmation.',

  inputSchema: z.object({
    userRequest: z.string().describe('What the user wants to accomplish'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),

  execute: async ({ context }) => {
    return await curateFunctionWorkflow.execute({
      inputData: context,
    } as Parameters<typeof curateFunctionWorkflow.execute>[0]);
  },
});
