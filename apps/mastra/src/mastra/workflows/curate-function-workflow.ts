import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { getCoreServices } from '../services/core.service';

const inputSchema = z.object({
  userRequest: z.string().describe('What the user wants to accomplish'),
});

// Step 1: Invoke Curator (fully autonomous)
const invokeCurator = createStep({
  id: 'invoke-curator',
  description: 'Curator handles entire curation process autonomously',
  inputSchema,
  outputSchema: z.object({
    success: z.boolean(),
    functionName: z.string(),
    action: z.enum(['created', 'edited', 'fixed', 'optimized']),
    message: z.string(),
    userRequest: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { userRequest } = inputData;

    // Get curator agent from Mastra registry
    const { mastra } = await import('../index');
    const curatorAgent = mastra.getAgent('functionCuratorAgent');

    // Just pass the raw request - curator drives everything
    const result = await curatorAgent.generate(userRequest);

    // Parse result (curator should return JSON)
    let parsed: any;
    try {
      parsed = typeof result === 'string' ? JSON.parse(result) : result;
    } catch {
      return {
        success: false,
        functionName: '',
        action: 'created' as const,
        message: 'Failed to parse curator response',
        userRequest,
      };
    }

    return {
      success: parsed.success || false,
      functionName: parsed.functionName || '',
      action: parsed.action || 'created',
      message: parsed.message || '',
      userRequest,
    };
  },
});

// Step 2: Reindex Function (only if changed)
const indexFunction = createStep({
  id: 'index-function',
  description: 'Reindex function for RAG if created/edited',
  inputSchema: z.object({
    success: z.boolean(),
    functionName: z.string(),
    action: z.enum(['created', 'edited', 'fixed', 'optimized']),
    message: z.string(),
    userRequest: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { success, functionName, action, message } = inputData;

    if (!success) {
      return {
        success: false,
        message: `Function curation failed: ${message}`,
      };
    }

    try {
      // Reindex the function
      const coreServices = getCoreServices();
      const metadata = await coreServices.functionsService.getFunctionMetadata(functionName);
      await coreServices.functionsService.indexFunction(metadata);

      return {
        success: true,
        message: `Function "${functionName}" ${action} and indexed successfully`,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Function ${action} but indexing failed: ${errorMessage}`,
      };
    }
  },
});

// Create workflow
export const curateFunctionWorkflow = createWorkflow({
  id: 'curate-function',
  inputSchema,
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
})
  .then(invokeCurator)
  .then(indexFunction);

curateFunctionWorkflow.commit();
