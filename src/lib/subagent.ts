/**
 * Pure subagent helpers — no domain dependencies.
 * Lives in lib/ so tools/ can import without violating domain boundaries.
 */

// ── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_MAX_CHILDREN = 10;
export const DEFAULT_MAX_SPAWN_DEPTH = 3;
export const DEFAULT_RUN_TIMEOUT_SECONDS = 300;

// ── Key helpers ─────────────────────────────────────────────────────────────

export function subagentSessionKey(parentKey: string): string {
  return `${parentKey}:subagent:${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

export function isSubagentSessionKey(sessionKey: string): boolean {
  return sessionKey.includes(':subagent:');
}

export function getSubagentDepth(sessionKey: string): number {
  return (sessionKey.match(/:subagent:/g) || []).length;
}

export function canSpawnSubagent(sessionKey: string, maxDepth = DEFAULT_MAX_SPAWN_DEPTH): boolean {
  return getSubagentDepth(sessionKey) < maxDepth;
}
