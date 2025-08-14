import {
  createCoreServices,
  CoreServices,
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
    env: {
      provider: 'filepath',
      config: {
        envFilePath: '.env'
      },
    },
    shell: {
      config: {
        dataDir: process.env.DATA_DIR || '/tmp',
        shellPath: process.env.SHELL || '/bin/bash',
      },
    },
  });

  return coreServices;
}

/**
 * Get the initialized core services
 * Throws an error if not initialized
 */
export function getCoreServices(): CoreServices {
  if (!coreServices) {
    throw new Error('Core services not initialized. Make sure initializeCoreServices() was called in index.ts');
  }
  return coreServices;
}
