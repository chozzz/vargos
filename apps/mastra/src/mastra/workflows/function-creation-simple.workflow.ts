import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

/**
 * Function Creation Workflow (Simplified)
 *
 * A streamlined workflow for creating new functions.
 *
 * Flow:
 * 1. Generate and create function in one step
 * 2. Format output
 *
 * Note: This is a simplified version. Full version with duplicate checks
 * and testing will be implemented after basic flow is validated.
 */

// Step 1: Generate and create function
const createFunctionStep = createStep({
  id: 'create-function-combined',
  description: 'Generate function code and create files',

  inputSchema: z.object({
    functionSpec: z.string().describe('Description of function to create'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    functionId: z.string(),
    message: z.string(),
    error: z.string().describe('Error message if failed, empty string if success'),
  }),

  execute: async ({ inputData, mastra }) => {
    const { functionSpec } = inputData;

    try {
      const creatorAgent = mastra?.getAgent('functionCreatorAgent');
      if (!creatorAgent) {
        throw new Error('Function Creator Agent not found');
      }

      // Generate function code
      const result = await creatorAgent.generate(
        `Create a function: ${functionSpec}`,
        {
          structuredOutput: {
            schema: (await import('../agents/function-creator-agent')).FunctionGenerationSchema
          }
        }
      );

      const functionData = result.object as any;

      // Create function files using the tool
      const { createFunctionTool } = await import('../tools/functions');

      const createResult = await createFunctionTool.execute({
        context: {
          name: functionData.name,
          description: functionData.description,
          category: functionData.category,
          tags: functionData.tags,
          requiredEnvVars: functionData.requiredEnvVars,
          input: functionData.input,
          output: functionData.output,
          code: functionData.code,
        },
        runtimeContext: {},
      } as any);

      return {
        success: createResult.success,
        functionId: createResult.functionId,
        message: createResult.message,
        error: '',
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        functionId: '',
        message: 'Function creation failed',
        error: errorMessage,
      };
    }
  },
});

// Step 2: Format output
const formatOutputStep = createStep({
  id: 'format-output',
  description: 'Format creation result for user',

  inputSchema: z.object({
    success: z.boolean(),
    functionId: z.string(),
    message: z.string(),
    error: z.string(),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    functionId: z.string(),
    message: z.string(),
  }),

  execute: async ({ inputData }) => {
    const { success, functionId, message, error } = inputData;

    if (!success) {
      return {
        success: false,
        functionId: '',
        message: `❌ Function creation failed\n\nError: ${error}`,
      };
    }

    return {
      success: true,
      functionId,
      message: `✅ Function created successfully!\n\n**Function ID:** ${functionId}\n\n${message}`,
    };
  },
});

// Create the workflow
export const functionCreationWorkflow = createWorkflow({
  id: 'function-creation',
  description: 'Create a new Vargos function',

  inputSchema: z.object({
    functionSpec: z.string().describe('Description of function to create'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    functionId: z.string(),
    message: z.string(),
  }),
})
  .then(createFunctionStep)
  .then(formatOutputStep)
  .commit();
