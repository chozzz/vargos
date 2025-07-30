import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getFunctionsService } from '../services/functions.service';

const FUNCTIONS_DIR = process.env.FUNCTIONS_DIR || '/home/choz/.vargos/functions/src';

const inputSchema = z.object({
  functionName: z.string().describe('Name of the function to create (kebab-case)'),
  description: z.string().describe('Description of what the function does'),
  category: z.array(z.string()).describe('Categories for the function'),
  requiredEnvVars: z.array(z.string()).optional().default([]).describe('Required environment variables'),
  inputParams: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string(),
  })).describe('Input parameters'),
  outputParams: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string(),
  })).describe('Output parameters'),
});

const checkExistingFunction = createStep({
  id: 'check-existing-function',
  description: 'Check if function already exists',
  inputSchema,
  outputSchema: z.object({
    exists: z.boolean(),
    message: z.string(),
    functionName: z.string(),
    description: z.string(),
    category: z.array(z.string()),
    requiredEnvVars: z.array(z.string()),
    inputParams: z.array(z.any()),
    outputParams: z.array(z.any()),
  }),
  execute: async ({ inputData }) => {
    const { functionName } = inputData;

    // Check if directory already exists
    const functionDir = path.join(FUNCTIONS_DIR, functionName);
    try {
      await fs.access(functionDir);
      return {
        exists: true,
        message: `Function "${functionName}" already exists.`,
        ...inputData,
      };
    } catch {
      return {
        ...inputData,
        exists: false,
        message: 'Function does not exist, proceeding with creation.',
      };
    }
  },
});

const checkApiKeys = createStep({
  id: 'check-api-keys',
  description: 'Check if required API keys are configured',
  inputSchema: z.object({
    exists: z.boolean(),
    functionName: z.string(),
    description: z.string(),
    category: z.array(z.string()),
    requiredEnvVars: z.array(z.string()),
    inputParams: z.array(z.any()),
    outputParams: z.array(z.any()),
    message: z.string(),
  }),
  outputSchema: z.object({
    canProceed: z.boolean(),
    missing: z.array(z.string()),
    message: z.string(),
    functionName: z.string(),
    description: z.string(),
    category: z.array(z.string()),
    requiredEnvVars: z.array(z.string()),
    inputParams: z.array(z.any()),
    outputParams: z.array(z.any()),
    exists: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const { requiredEnvVars, exists } = inputData;

    if (exists) {
      return {
        ...inputData,
        canProceed: false,
        missing: [],
        message: 'Function already exists, skipping API key check.',
      };
    }

    if (!requiredEnvVars || requiredEnvVars.length === 0) {
      return {
        ...inputData,
        canProceed: true,
        missing: [],
        message: 'No API keys required.',
      };
    }

    const missing: string[] = [];
    const instructions: string[] = [];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        missing.push(envVar);
        instructions.push(generateApiKeyInstructions(envVar));
      }
    }

    if (missing.length > 0) {
      return {
        ...inputData,
        canProceed: false,
        missing,
        message: `Missing required API keys:\n\n${instructions.join('\n\n')}`,
      };
    }

    return {
      ...inputData,
      canProceed: true,
      missing: [],
      message: 'All required API keys are configured.',
    };
  },
});

const generateFunctionFiles = createStep({
  id: 'generate-function-files',
  description: 'Generate function files using core-lib',
  inputSchema: z.object({
    canProceed: z.boolean(),
    exists: z.boolean(),
    functionName: z.string(),
    description: z.string(),
    category: z.array(z.string()),
    requiredEnvVars: z.array(z.string()),
    inputParams: z.array(z.any()),
    outputParams: z.array(z.any()),
    missing: z.array(z.string()),
    message: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    path: z.string().optional(),
    message: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { exists, canProceed } = inputData;

    if (exists) {
      return {
        success: false,
        message: 'Function already exists, skipping generation.',
      };
    }

    if (!canProceed) {
      return {
        success: false,
        message: 'Cannot proceed without required API keys.',
      };
    }

    const {
      functionName,
      description,
      category,
      requiredEnvVars,
      inputParams,
      outputParams,
    } = inputData;

    try {
      // Use core-lib to create the function
      const functionsService = await getFunctionsService();

      const functionMeta = await functionsService.createFunction({
        metadata: {
          name: functionName,
          category,
          description,
          tags: [...category.map(c => c.toLowerCase()), 'generated'],
          requiredEnvVars,
          input: inputParams.map((p: any) => ({
            name: p.name,
            type: p.type,
            description: p.description,
          })),
          output: outputParams.map((p: any) => ({
            name: p.name,
            type: p.type,
            description: p.description,
          })),
        },
        // core-lib will generate default template code
      });

      const functionDir = path.join(FUNCTIONS_DIR, functionMeta.id);

      return {
        success: true,
        path: functionDir,
        message: `Function "${functionName}" created successfully at ${functionDir}. The function has been auto-indexed and is ready to use.`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error creating function: ${error.message}`,
      };
    }
  },
});

// Helper functions

function generateApiKeyInstructions(envVar: string): string {
  const serviceMap: Record<string, { name: string; url: string; docsUrl: string }> = {
    OPENAI_API_KEY: {
      name: 'OpenAI',
      url: 'https://platform.openai.com/api-keys',
      docsUrl: 'https://platform.openai.com/docs/api-reference',
    },
    OPENWEATHER_API_KEY: {
      name: 'OpenWeatherMap',
      url: 'https://home.openweathermap.org/api_keys',
      docsUrl: 'https://openweathermap.org/api',
    },
    SERP_API_KEY: {
      name: 'SerpAPI',
      url: 'https://serpapi.com/manage-api-key',
      docsUrl: 'https://serpapi.com/docs',
    },
    GITHUB_TOKEN: {
      name: 'GitHub',
      url: 'https://github.com/settings/tokens',
      docsUrl: 'https://docs.github.com/en/rest',
    },
  };

  const service = serviceMap[envVar];

  if (service) {
    return `**${envVar}:**
  - Service: ${service.name}
  - Get API key: ${service.url}
  - Documentation: ${service.docsUrl}`;
  }

  return `**${envVar}:**
  - Please configure this environment variable
  - Check the service documentation for API key instructions`;
}

// Create the workflow
export const createFunctionWorkflow = createWorkflow({
  id: 'create-function',
  inputSchema,
  outputSchema: z.object({
    success: z.boolean(),
    path: z.string().optional(),
    message: z.string(),
  }),
})
  .then(checkExistingFunction)
  .then(checkApiKeys)
  .then(generateFunctionFiles);

createFunctionWorkflow.commit();
