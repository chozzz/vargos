/**
 * Tools available to Vargos Agent
 */
import { VARGOS_CORE_TOOLS } from "../shared/tools/vargos-core-tools";

/**
 * Export all available tools for Vargos Agent
 *
 * Tools include:
 * - Function Management: list, search, get metadata, execute functions
 * - Shell: Execute commands in persistent bash session
 * - Environment: Get, search, set environment variables
 * - Vector: Semantic search across vector database
 */
export const TOOLS = [
  ...VARGOS_CORE_TOOLS, // All Vargos core-lib tools
];
