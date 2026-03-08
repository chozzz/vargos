/**
 * Shared path resolution for fs tools.
 * Expands tilde, resolves the path against the working directory,
 * and validates the boundary if one is configured.
 */

import * as path from 'node:path';
import { expandTilde, validateBoundary } from '../../lib/path.js';
import { errorResult, type ToolContext, type ToolResult } from '../types.js';

export interface ResolvedPath {
  filePath: string;
}

export type ResolveFsPathResult =
  | { ok: true; filePath: string }
  | { ok: false; error: ToolResult };

export async function resolveFsPath(
  inputPath: string,
  context: ToolContext,
): Promise<ResolveFsPathResult> {
  const expanded = expandTilde(inputPath);
  let filePath = path.resolve(context.workingDir, expanded);

  if (context.boundary) {
    try {
      filePath = await validateBoundary(filePath, context.boundary, context.boundaryAllowlist);
    } catch (err) {
      return {
        ok: false,
        error: errorResult(err instanceof Error ? err.message : 'Path outside boundary'),
      };
    }
  }

  return { ok: true, filePath };
}
