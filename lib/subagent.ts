/**
 * Pure session key helpers — no domain dependencies.
 */

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
  const root = key.split(':subagent')[0];
  const sep  = root.indexOf(':');
  if (sep === -1) return { type: root, id: '' };
  return { type: root.slice(0, sep), id: root.slice(sep + 1) };
}
