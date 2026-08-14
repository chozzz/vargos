/**
 * YAML frontmatter for markdown files — a thin wrapper over `yaml`.
 *
 * Malformed frontmatter is reported as absent (null) rather than partially parsed:
 * yaml's own error recovery folds a broken line into its neighbouring key, which is
 * worse than saying nothing was found.
 */

import YAML from 'yaml';

export interface FrontmatterResult<T = Record<string, unknown>> {
  meta: T;
  body: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n?---\n?([\s\S]*)/;

/**
 * Parse YAML frontmatter. The optional generic `T` lets callers declare the expected
 * meta shape — at runtime the parsed value is just cast (no validation), so callers should
 * still treat fields as optional unless they validate downstream (Zod, manual checks).
 */
export function parseFrontmatter<T = Record<string, unknown>>(content: string): FrontmatterResult<T> | null {
  if (typeof content !== 'string') return null;

  const match = content.match(FRONTMATTER_RE);
  if (!match) return null;

  const body = match[2]?.trim() ?? '';

  try {
    // `---\n---` is a valid wrapper with no keys — callers distinguish that (empty meta)
    // from "no frontmatter wrapper at all" (null).
    return { meta: (YAML.parse(match[1]) ?? {}) as T, body };
  } catch {
    return null;
  }
}

/** Serialize meta + body back into a frontmatter document. Undefined/null keys are dropped. */
export function serializeFrontmatter(meta: Record<string, unknown>, body: string): string {
  const present = Object.entries(meta).filter(([, value]) => value !== undefined && value !== null);
  const frontmatter = present.length ? YAML.stringify(Object.fromEntries(present)) : '';
  return `---\n${frontmatter}---\n\n${body}\n`;
}
