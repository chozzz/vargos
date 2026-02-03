/**
 * Common utilities for error handling and tool execution
 * Extracted to reduce code duplication
 */

import type { ToolResult } from '../tools/types.js';

// Re-export from agent/prompt for consistency
export { isSubagentSessionKey } from '../agent/prompt.js';

/**
 * Format error to standard ToolResult format
 */
export function formatErrorResult(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * Tools that subagents are not allowed to use
 */
export const SUBAGENT_DENIED_TOOLS = [
  'sessions_list',
  'sessions_history',
  'sessions_send',
  'sessions_spawn',
] as const;

/**
 * Check if a tool is allowed for subagent sessions
 */
export function isToolAllowedForSubagent(toolName: string): boolean {
  return !SUBAGENT_DENIED_TOOLS.includes(toolName as typeof SUBAGENT_DENIED_TOOLS[number]);
}
