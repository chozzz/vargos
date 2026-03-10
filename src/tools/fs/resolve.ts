/**
 * Shared path resolution for fs tools.
 * Expands tilde and resolves the path against the working directory.
 */

import * as path from 'node:path';
import { expandTilde } from '../../lib/path.js';
import type { ToolContext } from '../types.js';

export function resolveFsPath(inputPath: string, context: ToolContext): string {
  const expanded = expandTilde(inputPath);
  return path.resolve(context.workingDir, expanded);
}
