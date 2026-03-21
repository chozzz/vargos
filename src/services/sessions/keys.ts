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
  channelSessionKey,
  cronSessionKey,
  parseSessionKey,
} from '../../lib/subagent.js';

export function webhookSessionKey(hookId: string): string {
  return `webhook:${hookId}:${Date.now()}`;
}

export function cliSessionKey(command: string): string {
  return `cli:${command}:${Date.now()}`;
}
