/**
 * Vargos LangChain Agents - Centralized Initialization
 *
 * This script initializes all shared services ONCE before any graphs are loaded:
 * - Vargos core services (functions, LLM, vector, env, shell)
 * - PostgreSQL checkpointer for conversation persistence
 *
 * All graph files import the pre-initialized instances from this module.
 * This prevents redundant initialization and ensures proper startup order.
 */

import { initializeVargosCoreServices } from "./shared/services/vargos-core";
import { getCheckpointer } from "./shared/checkpointer";
import type { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

console.log("\n" + "=".repeat(60));
console.log("  Vargos LangChain Agents - Initialization");
console.log("=".repeat(60) + "\n");

// Export the checkpointer instance for all graphs to use
export let checkpointer: PostgresSaver;

try {
  // Initialize Vargos core services (functions, shell, env, vector, LLM)
  await initializeVargosCoreServices();

  // Initialize PostgreSQL checkpointer for persistent chat history
  checkpointer = await getCheckpointer();

  console.log("=".repeat(60));
  console.log("  ✅ Ready to serve LangGraph agents");
  console.log("=".repeat(60) + "\n");
} catch (error) {
  console.error("\n" + "=".repeat(60));
  console.error("  ❌ Initialization Failed");
  console.error("=".repeat(60));
  console.error("\nError:", error);
  console.error("\nPlease check your .env file and ensure all required");
  console.error("environment variables are set:");
  console.error("  - OPENAI_API_KEY");
  console.error("  - QDRANT_URL");
  console.error("  - FUNCTIONS_DIR");
  console.error("  - LANGCHAIN_DATABASE_URL (optional, for persistent chat history)");
  console.error("\n" + "=".repeat(60) + "\n");

  // Exit with error code to prevent LangGraph from starting
  process.exit(1);
}
