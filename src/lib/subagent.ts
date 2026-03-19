/**
 * Pure session key helpers — no domain dependencies.
 * Lives in lib/ so all domains can import without violating boundaries.
 */

// ── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_MAX_CHILDREN = 10;
export const DEFAULT_MAX_SPAWN_DEPTH = 3;
export const DEFAULT_RUN_TIMEOUT_SECONDS = 300;

// ── Subagent key helpers ─────────────────────────────────────────────────────

export function subagentSessionKey(parentKey: string): string {
  return `${parentKey}:subagent:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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

// ── General session key helpers ──────────────────────────────────────────────

export function channelSessionKey(channel: string, userId: string): string {
  return `${channel}:${userId}`;
}

export function cronSessionKey(taskId: string): string {
  return `cron:${taskId}:${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Parse a session key into its type and id components.
 * Subagent suffixes are stripped before parsing.
 */
export function parseSessionKey(key: string): { type: string; id: string } {
  const root = key.split(':subagent:')[0];
  const sep = root.indexOf(':');
  if (sep === -1) return { type: root, id: '' };
  return { type: root.slice(0, sep), id: root.slice(sep + 1) };
}
