/**
 * Common utilities for error handling and tool execution
 */

/** Check if session key is a subagent */
export function isSubagentSessionKey(sessionKey: string): boolean {
  return sessionKey.includes(':subagent:');
}

/** Count nesting depth of subagent session keys */
export function getSubagentDepth(sessionKey: string): number {
  return (sessionKey.match(/:subagent:/g) || []).length;
}

/** Check if a session can spawn another subagent (depth-limited) */
export function canSpawnSubagent(sessionKey: string, maxDepth = 3): boolean {
  return getSubagentDepth(sessionKey) < maxDepth;
}
