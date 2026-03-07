/**
 * Centralized session key construction and parsing.
 * Single source of truth for all session key formats.
 *
 * Subagent helpers re-exported from lib/subagent.ts (pure utilities,
 * importable by tools/ without violating domain boundaries).
 */

export {
  DEFAULT_MAX_CHILDREN,
  DEFAULT_MAX_SPAWN_DEPTH,
  DEFAULT_RUN_TIMEOUT_SECONDS,
  subagentSessionKey,
  isSubagentSessionKey,
  getSubagentDepth,
  canSpawnSubagent,
} from '../lib/subagent.js';

// ── Builders ────────────────────────────────────────────────────────────────

export function channelSessionKey(channel: string, userId: string): string {
  return `${channel}:${userId}`;
}

export function cronSessionKey(taskId: string): string {
  return `cron:${taskId}:${new Date().toISOString().slice(0, 10)}`;
}

export function webhookSessionKey(hookId: string): string {
  return `webhook:${hookId}:${Date.now()}`;
}

export function cliSessionKey(command: string): string {
  return `cli:${command}:${Date.now()}`;
}

// ── Parsing ─────────────────────────────────────────────────────────────────

export function parseSessionKey(key: string): { type: string; id: string } {
  const root = key.split(':subagent:')[0];
  const sep = root.indexOf(':');
  if (sep === -1) return { type: root, id: '' };
  return { type: root.slice(0, sep), id: root.slice(sep + 1) };
}
