/**
 * Common utilities for error handling and tool execution
 * Extracted to reduce code duplication
 */

import type { ToolResult } from '../mcp/tools/types.js';

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
 * Format success result
 */
export function formatSuccessResult(text: string): ToolResult {
  return {
    content: [{ type: 'text', text }],
    isError: false,
  };
}

/**
 * Safely execute an async function with error handling
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  errorMapper?: (error: unknown) => T
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (errorMapper) {
      return errorMapper(err);
    }
    throw err;
  }
}

/**
 * Check if a tool is allowed for subagent sessions
 */
export const SUBAGENT_DENIED_TOOLS = [
  'sessions_list',
  'sessions_history', 
  'sessions_send',
  'sessions_spawn',
] as const;

export function isToolAllowedForSubagent(toolName: string): boolean {
  return !SUBAGENT_DENIED_TOOLS.includes(toolName as typeof SUBAGENT_DENIED_TOOLS[number]);
}

/**
 * Check if session key is a subagent
 */
export function isSubagentSessionKey(sessionKey: string): boolean {
  return sessionKey.includes(':subagent:') || sessionKey.startsWith('subagent-');
}
