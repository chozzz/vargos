/**
 * Pure session key helpers — no domain dependencies.
 */

export const DEFAULT_MAX_SPAWN_DEPTH      = 3;

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

export function channelSessionKey(channel: string, userId: string): string {
  return `${channel}:${userId}`;
}

export function cronSessionKey(taskId: string): string {
  return `cron:${taskId}:${new Date().toISOString().slice(0, 10)}`;
}

export function webhookSessionKey(hookId: string): string {
  return `webhook:${hookId}:${Date.now()}`;
}

export function parseSessionKey(key: string): { type: string; id: string } {
  const root = key.split(':subagent:')[0];
  const sep  = root.indexOf(':');
  if (sep === -1) return { type: root, id: '' };
  return { type: root.slice(0, sep), id: root.slice(sep + 1) };
}
