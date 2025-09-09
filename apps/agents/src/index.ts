/**
 * Vargos LangChain Agents - Initialization Script
 *
 * This script initializes Vargos core services before the LangGraph server starts.
 * It ensures all agents have access to:
 * - Functions service (list, search, execute)
 * - LLM service (embeddings, chat)
 * - Vector service (semantic search)
 * - Env service (environment variables)
 * - Shell service (command execution)
 *
 * The LangGraph CLI will execute this file before loading graph definitions.
 */

import { initializeVargosCoreServices } from "./shared/services/vargos-core.js";

console.log("\n" + "=".repeat(60));
console.log("  Vargos LangChain Agents - Initialization");
console.log("=".repeat(60) + "\n");

try {
  // Initialize core services
  await initializeVargosCoreServices();

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
  console.error("\n" + "=".repeat(60) + "\n");

  // Exit with error code to prevent LangGraph from starting
  process.exit(1);
}
