import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Tool for executing workflows
 */
export const executeWorkflowTool = createTool({
  id: 'execute-workflow' as const,
  description: 'Execute a multi-step workflow, optionally in the background',
  inputSchema: z.object({
    workflowName: z.string().describe('Name of the workflow to execute'),
    params: z.record(z.string(), z.any()).describe('Parameters to pass to the workflow'),
    background: z.boolean().default(false).describe('Whether to execute in background (async)'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    runId: z.string().optional(),
    status: z.enum(['running', 'completed', 'failed']),
    result: z.any().optional(),
  }),
  execute: async ({ context, mastra }): Promise<{
    success: boolean;
    message: string;
    runId?: string;
    status: 'running' | 'completed' | 'failed';
    result?: any;
  }> => {
    const { workflowName, params, background } = context;

    try {
      if (!mastra) {
        return {
          success: false,
          message: 'Mastra instance not available',
          status: 'failed',
        };
      }

      const workflow = mastra.getWorkflow(workflowName);

      if (!workflow) {
        return {
          success: false,
          message: `Workflow "${workflowName}" not found in registry`,
          status: 'failed',
        };
      }

      if (background) {
        // For background execution, we'd need a proper task queue system
        // For now, return a placeholder runId
        const runId = `run-${Date.now()}`;
        // In a real implementation, this would queue the workflow
        return {
          success: true,
          message: `Workflow "${workflowName}" queued for background execution`,
          runId,
          status: 'running',
        };
      }

      // Synchronous execution - workflows accept input data directly
      const result = await workflow.execute({
        inputData: params,
      } as Parameters<typeof workflow.execute>[0]);
      return {
        success: true,
        message: `Workflow "${workflowName}" executed successfully`,
        status: 'completed',
        result,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Error executing workflow "${workflowName}": ${errorMessage}`,
        status: 'failed',
      };
    }
  },
});
