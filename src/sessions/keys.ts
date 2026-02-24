/**
 * Centralized session key construction and parsing.
 * Single source of truth for all session key formats.
 */

// ── Builders ─────────────────────────────────────────────────────────────────

export function channelSessionKey(channel: string, userId: string): string {
  return `${channel}:${userId}`;
}

export function cronSessionKey(taskId: string): string {
  return `cron:${taskId}:${Date.now()}`;
}

export function webhookSessionKey(hookId: string): string {
  return `webhook:${hookId}:${Date.now()}`;
}

export function cliSessionKey(command: string): string {
  return `cli:${command}:${Date.now()}`;
}

export function subagentSessionKey(parentKey: string): string {
  return `${parentKey}:subagent:${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

export function parseSessionKey(key: string): { type: string; id: string } {
  const root = key.split(':subagent:')[0];
  const sep = root.indexOf(':');
  if (sep === -1) return { type: root, id: '' };
  return { type: root.slice(0, sep), id: root.slice(sep + 1) };
}

// ── Subagent helpers (moved from lib/errors.ts) ──────────────────────────────

export function isSubagentSessionKey(sessionKey: string): boolean {
  return sessionKey.includes(':subagent:');
}

export function getSubagentDepth(sessionKey: string): number {
  return (sessionKey.match(/:subagent:/g) || []).length;
}

export function canSpawnSubagent(sessionKey: string, maxDepth = 3): boolean {
  return getSubagentDepth(sessionKey) < maxDepth;
}
