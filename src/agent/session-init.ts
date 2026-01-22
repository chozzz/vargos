/**
 * Session manager initialization helpers
 * Ensures Pi SDK SessionManager is in a consistent state before runs
 */

import type { SessionManager } from '@mariozechner/pi-coding-agent';
import { promises as fs } from 'node:fs';

/**
 * Prepare a SessionManager for a new agent run.
 *
 * Handles edge case: if a session file exists but contains no messages
 * (only header), delete it so SessionManager starts fresh. This prevents
 * a partially-written session from corrupting the conversation state.
 */
export async function prepareSessionManager(params: {
  sessionManager: SessionManager;
  sessionFile: string;
}): Promise<void> {
  const { sessionManager, sessionFile } = params;
  const entries = sessionManager.getEntries();

  // If file exists but has no message entries, it's a partial write — start fresh
  if (entries.length === 0) {
    try {
      await fs.unlink(sessionFile);
    } catch {
      // File may not exist on disk yet
    }
  }
}
