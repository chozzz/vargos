/**
 * Common utilities for error handling and tool execution
 * Extracted to reduce code duplication
 */

// Re-export from runtime/prompt for consistency
export { isSubagentSessionKey } from '../core/runtime/prompt.js';

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
