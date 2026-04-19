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

/** Parse "type:id" format from a string, extracting first component. */
function parseTypeIdFormat(str: string): { type: string; id: string } {
  const sep = str.indexOf(':');
  if (sep === -1) return { type: str, id: '' };
  return { type: str.slice(0, sep), id: str.slice(sep + 1) };
}

export function parseSessionKey(key: string): { type: string; id: string } {
  const root = key.split(':subagent')[0];
  return parseTypeIdFormat(root);
}

export function parseChannelTarget(target: string): { channel: string; userId: string } | null {
  const { type: channel, id: userId } = parseTypeIdFormat(target);
  return userId ? { channel, userId } : null;
}
