/**
 * Shared YAML frontmatter parser for markdown files (skills, agents).
 * Handles simple key: value pairs and inline arrays.
 */

export interface FrontmatterResult {
  meta: Record<string, unknown>;
  body: string;
}

/** Parse YAML frontmatter from a markdown string. */
export function parseFrontmatter(content: string): FrontmatterResult | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/);
  if (!match) return null;

  const meta: Record<string, unknown> = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w+):\s*(.+)/);
    if (!m) continue;
    let value: unknown = m[2].trim();
    // Inline array: [a, b, c]
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    }
    // Strip surrounding quotes
    if (typeof value === 'string' && /^["'].*["']$/.test(value)) {
      value = value.slice(1, -1);
    }
    meta[m[1]] = value;
  }
  return { meta, body: match[2].trim() };
}
