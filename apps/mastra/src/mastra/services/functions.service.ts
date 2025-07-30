import {
  createCoreServices,
  CoreServices,
  FunctionsService,
} from '@vargos/core-lib';

let coreServices: CoreServices | null = null;

/**
 * Initialize core services for Mastra
 * This should be called once at application startup
 */
export async function initializeCoreServices(): Promise<CoreServices> {
  if (coreServices) {
    return coreServices;
  }

  const functionsDir = process.env.FUNCTIONS_DIR;
  if (!functionsDir) {
    throw new Error('FUNCTIONS_DIR environment variable is required');
  }

  coreServices = await createCoreServices({
    llm: {
      provider: 'openai',
      config: {
        apiKey: process.env.OPENAI_API_KEY || '',
      },
    },
    vector: {
      provider: 'qdrant',
      config: {
        url: process.env.QDRANT_URL || '',
        apiKey: process.env.QDRANT_API_KEY || '',
        port: parseInt(process.env.QDRANT_PORT || '443'),
      },
    },
    functions: {
      provider: 'local-directory',
      config: {
        functionsDir,
      },
    },
  });

  return coreServices;
}

/**
 * Get the functions service
 * Initializes services if not already initialized
 */
export async function getFunctionsService(): Promise<FunctionsService> {
  const services = await initializeCoreServices();
  return services.functionsService;
}

/**
 * Direct access to core services (for advanced use cases)
 */
export async function getCoreServices(): Promise<CoreServices> {
  return initializeCoreServices();
}

