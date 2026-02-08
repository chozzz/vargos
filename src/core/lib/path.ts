/**
 * Path utilities for MCP tools
 */

import path from 'node:path';
import os from 'node:os';

/** Expand leading ~ to homedir so paths like ~/dev/foo resolve correctly. */
export function expandTilde(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}
