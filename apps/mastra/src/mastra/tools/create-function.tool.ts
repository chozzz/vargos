import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createFunctionWorkflow } from '../workflows/create-function-workflow';

/**
 * Tool for creating new functions
 */
export const createFunctionTool = createTool({
  id: 'create-function' as const,
  description: 'Create a new Vargos function when requested functionality does not exist. Checks for required API keys and explains to user if missing.',
  inputSchema: z.object({
    functionName: z.string().describe('Name of the function in kebab-case (e.g., "github-get-user")'),
    description: z.string().describe('Clear description of what the function does'),
    category: z.array(z.string()).describe('Categories like ["GitHub", "API"]'),
    requiredEnvVars: z.array(z.string()).optional().describe('Required environment variables (e.g., ["GITHUB_TOKEN"])'),
    inputParams: z.array(z.object({
      name: z.string(),
      type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
      description: z.string(),
    })).describe('Input parameters for the function'),
    outputParams: z.array(z.object({
      name: z.string(),
      type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
      description: z.string(),
    })).describe('Output fields from the function'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    functionPath: z.string().optional(),
    missingApiKeys: z.array(z.string()).optional(),
    apiKeyInstructions: z.string().optional(),
  }),
  execute: async ({ context }): Promise<{
    success: boolean;
    message: string;
    functionPath?: string;
    missingApiKeys?: string[];
    apiKeyInstructions?: string;
  }> => {
    const {
      functionName,
      description,
      category,
      requiredEnvVars = [],
      inputParams,
      outputParams,
    } = context;

    try {
      // Workflow execution - Mastra workflows accept input data directly
      const result = await createFunctionWorkflow.execute({
        inputData: {
          functionName,
          description,
          category,
          requiredEnvVars,
          inputParams,
          outputParams,
        },
      } as Parameters<typeof createFunctionWorkflow.execute>[0]);

      // The workflow returns the final step output directly
      if (!result.success) {
        // Check if it's an API key issue - result contains the workflow output
        const workflowOutput = result as unknown as {
          missing?: string[];
          message?: string;
        };
        if (workflowOutput?.missing && workflowOutput.missing.length > 0) {
          return {
            success: false,
            message: workflowOutput.message || 'Missing required API keys',
            missingApiKeys: workflowOutput.missing,
            apiKeyInstructions: workflowOutput.message,
          };
        }

        return {
          success: false,
          message: workflowOutput?.message || result.message || 'Function creation failed',
        };
      }

      return {
        success: true,
        message: result.message || `Function "${functionName}" created successfully`,
        functionPath: result.path,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Error creating function: ${errorMessage}`,
      };
    }
  },
});
