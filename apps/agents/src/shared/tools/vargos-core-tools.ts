/**
 * Vargos Core-Lib Tools for LangChain Agents
 *
 * These tools provide LangChain agents direct access to Vargos core services:
 * - Functions (list, search, execute)
 * - Shell (execute commands)
 * - Environment variables (get, set, search)
 *
 * All tools use @workspace/core-lib directly (no HTTP overhead)
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getVargosCoreServices } from "../services/vargos-core.js";

/**
 * List all available Vargos functions
 */
export const listVargosFunctionsTool = new DynamicStructuredTool({
  name: "list_vargos_functions",
  description:
    "List all available Vargos functions from the local repository. " +
    "Returns function metadata including ID, name, description, category, and tags. " +
    "Use this to discover what functions are available before executing them.",
  schema: z.object({}),
  func: async () => {
    const { functionsService } = getVargosCoreServices();
    const result = await functionsService.listFunctions();
    return JSON.stringify(result, null, 2);
  },
});

/**
 * Search Vargos functions semantically
 */
export const searchVargosFunctionsTool = new DynamicStructuredTool({
  name: "search_vargos_functions",
  description:
    "Search for relevant Vargos functions using semantic search. " +
    "Provide a natural language query describing what you need (e.g., 'get Jira issues', 'search GitHub'). " +
    "Returns the most relevant functions ranked by similarity.",
  schema: z.object({
    query: z
      .string()
      .describe("Natural language query describing the function you need"),
    limit: z
      .number()
      .optional()
      .default(5)
      .describe("Maximum number of results to return (default: 5)"),
  }),
  func: async ({ query, limit }) => {
    const { functionsService } = getVargosCoreServices();
    const results = await functionsService.searchFunctions(query, limit);
    return JSON.stringify(results, null, 2);
  },
});

/**
 * Get metadata for a specific Vargos function
 */
export const getFunctionMetadataTool = new DynamicStructuredTool({
  name: "get_function_metadata",
  description:
    "Get detailed metadata for a specific Vargos function by ID. " +
    "Returns complete function information including name, description, parameters, category, tags, and file paths. " +
    "Use this before executing a function to understand its parameters.",
  schema: z.object({
    functionId: z.string().describe("The unique ID of the function"),
  }),
  func: async ({ functionId }) => {
    const { functionsService } = getVargosCoreServices();
    const metadata = await functionsService.getFunctionMetadata(functionId);
    return JSON.stringify(metadata, null, 2);
  },
});

/**
 * Execute a Vargos function
 */
export const executeVargosFunctionTool = new DynamicStructuredTool({
  name: "execute_vargos_function",
  description:
    "Execute a Vargos function by ID with provided parameters. " +
    "Make sure to get the function metadata first to understand required parameters. " +
    "Returns the function execution result.",
  schema: z.object({
    functionId: z.string().describe("The ID of the function to execute"),
    parameters: z
      .record(z.any())
      .describe("Object containing function parameters as key-value pairs"),
  }),
  func: async ({ functionId, parameters }) => {
    const { functionsService } = getVargosCoreServices();
    const result = await functionsService.executeFunction(
      functionId,
      parameters,
    );
    return JSON.stringify(result, null, 2);
  },
});

/**
 * Execute shell command via Vargos
 */
export const vargosShellTool = new DynamicStructuredTool({
  name: "vargos_shell",
  description:
    "Execute shell commands in a persistent bash session. " +
    "The shell maintains state across commands (e.g., cd, environment variables). " +
    "Returns stdout, stderr, and exit code. " +
    "Use for system operations, file manipulation, or running CLI tools.",
  schema: z.object({
    command: z.string().describe("The shell command to execute"),
  }),
  func: async ({ command }) => {
    const { shellService } = getVargosCoreServices();
    if (!shellService) {
      throw new Error("Shell service not initialized in core services");
    }
    const result = await shellService.execute(command);
    return JSON.stringify(result, null, 2);
  },
});

/**
 * Get environment variable
 */
export const getEnvVarTool = new DynamicStructuredTool({
  name: "get_env_var",
  description:
    "Get the value of an environment variable. " +
    "Returns the variable value or null if not found. " +
    "Sensitive values (API keys, passwords) are automatically censored.",
  schema: z.object({
    key: z.string().describe("The environment variable name (e.g., 'OPENAI_API_KEY')"),
  }),
  func: async ({ key }) => {
    const { envService } = getVargosCoreServices();
    if (!envService) {
      throw new Error("Env service not initialized in core services");
    }
    const value = await envService.get(key);
    return value !== null ? value : `Environment variable '${key}' not found`;
  },
});

/**
 * Search environment variables
 */
export const searchEnvVarsTool = new DynamicStructuredTool({
  name: "search_env_vars",
  description:
    "Search environment variables by partial key match. " +
    "Returns all variables whose keys contain the search query (case-insensitive). " +
    "Useful for discovering available environment variables.",
  schema: z.object({
    query: z.string().describe("Search query to match against variable names"),
  }),
  func: async ({ query }) => {
    const { envService } = getVargosCoreServices();
    if (!envService) {
      throw new Error("Env service not initialized in core services");
    }
    const results = await envService.search(query);
    return JSON.stringify(results, null, 2);
  },
});

/**
 * Set environment variable
 */
export const setEnvVarTool = new DynamicStructuredTool({
  name: "set_env_var",
  description:
    "Set or update an environment variable. " +
    "Changes are persisted to the .env file. " +
    "Returns success confirmation. " +
    "⚠️ Use with caution - this modifies environment configuration.",
  schema: z.object({
    key: z.string().describe("The environment variable name"),
    value: z.string().describe("The value to set"),
  }),
  func: async ({ key, value }) => {
    const { envService } = getVargosCoreServices();
    if (!envService) {
      throw new Error("Env service not initialized in core services");
    }
    await envService.set(key, value);
    return `Environment variable '${key}' set successfully`;
  },
});

/**
 * Semantic search across vector database
 */
export const semanticSearchTool = new DynamicStructuredTool({
  name: "semantic_search",
  description:
    "Perform semantic search across indexed data in the vector database. " +
    "Searches the specified collection using natural language queries. " +
    "Returns relevant results ranked by similarity score.",
  schema: z.object({
    query: z.string().describe("Natural language search query"),
    collectionName: z
      .string()
      .optional()
      .default("vargos-functions-meta")
      .describe("Vector collection to search (default: vargos-functions-meta)"),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of results (default: 10)"),
  }),
  func: async ({ query, collectionName, limit }) => {
    const { vectorService } = getVargosCoreServices();
    const results = await vectorService.search(query, {
      collectionName: collectionName || "vargos-functions-meta",
      limit,
    });
    return JSON.stringify(results, null, 2);
  },
});

/**
 * Export all Vargos core-lib tools
 * Add these to your LangChain agent's tools array
 */
export const VARGOS_CORE_TOOLS = [
  // Functions tools
  listVargosFunctionsTool,
  searchVargosFunctionsTool,
  getFunctionMetadataTool,
  executeVargosFunctionTool,

  // Shell tool
  vargosShellTool,

  // Environment tools
  getEnvVarTool,
  searchEnvVarsTool,
  setEnvVarTool,

  // Vector search tool
  semanticSearchTool,
];
