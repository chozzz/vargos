/**
 * Vargos Core Services Integration for LangChain Agents
 *
 * This module initializes and provides access to Vargos core-lib services
 * (Functions, LLM, Vector, Env, Shell) for use in LangGraph agents.
 *
 * Usage:
 * 1. Call initializeVargosCoreServices() once at app startup
 * 2. Use getVargosCoreServices() in tools to access services
 */

import { createCoreServices, CoreServices } from "@workspace/core-lib";

let coreServicesInstance: CoreServices | null = null;

/**
 * Initialize Vargos core services
 * Should be called once before LangGraph server starts
 *
 * @returns Promise<CoreServices> - Initialized core services
 * @throws Error if environment variables are missing
 */
export async function initializeVargosCoreServices(): Promise<CoreServices> {
  if (coreServicesInstance) {
    console.log("⚡ Core services already initialized, returning existing instance");
    return coreServicesInstance;
  }

  console.log("🔧 Initializing Vargos Core Services for LangChain agents...\n");

  // Validate required environment variables
  const requiredEnvVars = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    QDRANT_URL: process.env.QDRANT_URL,
    QDRANT_API_KEY: process.env.QDRANT_API_KEY,
    FUNCTIONS_DIR: process.env.FUNCTIONS_DIR,
  };

  const missingVars = Object.entries(requiredEnvVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}\n` +
      "Please ensure these are set in your .env file."
    );
  }

  try {
    coreServicesInstance = await createCoreServices({
      llm: {
        provider: "openai",
        config: {
          apiKey: process.env.OPENAI_API_KEY!,
        },
      },
      vector: {
        provider: "qdrant",
        config: {
          url: process.env.QDRANT_URL!,
          port: parseInt(process.env.QDRANT_PORT || "443"),
          apiKey: process.env.QDRANT_API_KEY!,
        },
      },
      functions: {
        provider: "local-directory",
        config: {
          functionsDir: process.env.FUNCTIONS_DIR!,
        },
      },
      env: {
        provider: "filepath",
        config: {
          envFilePath: process.env.ENV_FILE_PATH,
          censoredKeys: ["API_KEY", "SECRET", "PASSWORD", "TOKEN"],
        },
      },
      shell: {
        config: {
          dataDir: process.env.DATA_DIR || "~/.vargos/data",
          shellPath: process.env.SHELL_PATH || "/bin/bash",
        },
      },
      functionsService: {
        functionMetaCollection: "vargos-functions-meta",
      },
    });

    console.log("\n✅ Vargos Core Services initialized successfully\n");
    return coreServicesInstance;
  } catch (error) {
    console.error("❌ Failed to initialize Vargos Core Services:", error);
    throw error;
  }
}

/**
 * Get initialized Vargos core services
 * Must be called after initializeVargosCoreServices()
 *
 * @returns CoreServices - The initialized core services instance
 * @throws Error if services are not initialized
 */
export function getVargosCoreServices(): CoreServices {
  if (!coreServicesInstance) {
    throw new Error(
      "Vargos Core Services not initialized. " +
      "Call initializeVargosCoreServices() before using tools."
    );
  }
  return coreServicesInstance;
}

/**
 * Reset core services instance (useful for testing)
 * @internal
 */
export function resetVargosCoreServices(): void {
  coreServicesInstance = null;
}
