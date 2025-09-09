/**
 * This file defines the tools available to the ReAct agent.
 * Tools are functions that the agent can use to interact with external systems or perform specific tasks.
 */
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { VARGOS_CORE_TOOLS } from "../shared/tools/vargos-core-tools.js";

/**
 * Tavily search tool configuration
 * This tool allows the agent to perform web searches using the Tavily API.
 */
const searchTavily = new TavilySearchResults({
  maxResults: 3,
});

/**
 * Export an array of all available tools
 * Add new tools to this array to make them available to the agent
 *
 * Available tools:
 * - searchTavily: Web search via Tavily API
 * - VARGOS_CORE_TOOLS: Direct access to Vargos core services
 *   - list_vargos_functions: List all available Vargos functions
 *   - search_vargos_functions: Semantic search for functions
 *   - get_function_metadata: Get detailed function information
 *   - execute_vargos_function: Execute a function by ID
 *   - vargos_shell: Execute shell commands
 *   - get_env_var: Get environment variable value
 *   - search_env_vars: Search environment variables
 *   - set_env_var: Set environment variable
 *   - semantic_search: Search vector database
 *
 * Note: You can create custom tools by implementing the Tool interface from @langchain/core/tools
 * and add them to this array.
 * See https://js.langchain.com/docs/how_to/custom_tools/#tool-function for more information.
 */
export const TOOLS = [
  searchTavily,
  ...VARGOS_CORE_TOOLS, // Vargos core-lib integration (no HTTP overhead)
];
