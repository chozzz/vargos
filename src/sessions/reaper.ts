/**
 * Deterministic session reaper
 * Deletes old cron and subagent sessions based on TTL.
 * Never touches 'main' sessions — those are long-lived user/channel sessions.
 */

import type { ISessionService } from './types.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('reaper');

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReaperConfig {
  /** Max age for cron sessions in ms (default: 7 days) */
  cronTtlMs?: number;
  /** Max age for subagent sessions in ms (default: 3 days) */
  subagentTtlMs?: number;
}

const DEFAULTS: Required<ReaperConfig> = {
  cronTtlMs: 7 * DAY_MS,
  subagentTtlMs: 3 * DAY_MS,
};

export async function reapSessions(
  store: ISessionService,
  config: ReaperConfig = {},
): Promise<{ pruned: number }> {
  const ttl = { ...DEFAULTS, ...config };
  const now = Date.now();
  let pruned = 0;

  const kinds = ['cron', 'subagent'] as const;

  for (const kind of kinds) {
    const cutoff = now - (kind === 'cron' ? ttl.cronTtlMs : ttl.subagentTtlMs);
    const sessions = await store.list({ kind });

    for (const session of sessions) {
      if (session.updatedAt.getTime() > cutoff) continue;

      const deleted = await store.delete(session.sessionKey);
      if (deleted) {
        log.info(`reaped ${kind} session: ${session.sessionKey} (last active: ${session.updatedAt.toISOString()})`);
        pruned++;
      }
    }
  }

  if (pruned > 0) {
    log.info(`reaper complete: ${pruned} session(s) pruned`);
  }

  return { pruned };
}
