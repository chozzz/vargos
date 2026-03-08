/**
 * Path utilities for MCP tools
 */

import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

/** Expand leading ~ to homedir so paths like ~/dev/foo resolve correctly. */
export function expandTilde(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * Resolve a path that may not exist yet by walking up to the nearest existing
 * ancestor, realpathing that, then re-appending the remaining segments.
 */
async function resolveWithAncestor(filePath: string): Promise<string> {
  try {
    return await fs.realpath(filePath);
  } catch {
    // File doesn't exist — resolve via nearest existing ancestor
    const parts = filePath.split(path.sep);
    for (let i = parts.length - 1; i > 0; i--) {
      const ancestor = parts.slice(0, i).join(path.sep) || path.sep;
      try {
        const real = await fs.realpath(ancestor);
        const remaining = parts.slice(i).join(path.sep);
        return path.join(real, remaining);
      } catch {
        continue;
      }
    }
    return filePath;
  }
}

/**
 * Validate that a file path is within an allowed boundary.
 * Resolves symlinks and prevents traversal attacks.
 * Throws if path is outside boundary and not in allowlist.
 */
export async function validateBoundary(
  filePath: string,
  boundary: string,
  allowlist?: string[],
): Promise<string> {
  const resolved = await resolveWithAncestor(filePath);

  const withinBoundary =
    resolved === boundary || resolved.startsWith(boundary + path.sep);

  if (withinBoundary) return resolved;

  // Check allowlist entries
  if (allowlist && allowlist.length > 0) {
    for (const entry of allowlist) {
      let realEntry: string;
      try {
        realEntry = await fs.realpath(entry);
      } catch {
        realEntry = entry;
      }
      if (resolved === realEntry || resolved.startsWith(realEntry + path.sep)) {
        return resolved;
      }
    }
  }

  throw new Error(`Path outside allowed boundary: ${resolved}`);
}
