import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Tool for running tasks in background
 */
export const runInBackgroundTool = createTool({
  id: 'run-in-background' as const,
  description: 'Execute a long-running task asynchronously in the background',
  inputSchema: z.object({
    taskType: z.enum(['create-function', 'bulk-analysis', 'research']).describe('Type of task to run'),
    params: z.record(z.string(), z.any()).describe('Parameters for the task'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    runId: z.string().optional(),
    status: z.string(),
  }),
  execute: async ({ context, mastra }): Promise<{
    success: boolean;
    message: string;
    runId?: string;
    status: string;
  }> => {
    const { taskType, params } = context;

    try {
      if (!mastra) {
        return {
          success: false,
          message: 'Mastra instance not available',
          status: 'failed',
        };
      }

      const runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Map task types to workflows
      const workflowMap: Record<string, string> = {
        'create-function': 'create-function',
        'bulk-analysis': 'bulk-analysis', // Would need to be implemented
        'research': 'research', // Would need to be implemented
      };

      const workflowName = workflowMap[taskType];
      if (!workflowName) {
        return {
          success: false,
          message: `Unknown task type: ${taskType}`,
          status: 'failed',
        };
      }

      const workflow = mastra.getWorkflow(workflowName);
      if (!workflow) {
        return {
          success: false,
          message: `Workflow "${workflowName}" not found for task type "${taskType}"`,
          status: 'failed',
        };
      }

      // In a real implementation, this would queue the workflow in a background job system
      // For now, we'll execute it synchronously but return a runId
      // In production, you'd use a task queue like BullMQ, Bull, or similar
      workflow.execute({
        inputData: params,
      } as Parameters<typeof workflow.execute>[0]).catch((error) => {
        // Log error but don't throw - background task
        console.error(`Background task ${runId} failed:`, error);
      });

      return {
        success: true,
        message: `Task "${taskType}" started in background`,
        runId,
        status: 'running',
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Error starting background task: ${errorMessage}`,
        status: 'failed',
      };
    }
  },
});
