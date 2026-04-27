/**
 * Shared YAML frontmatter parser for markdown files.
 * Supports the format:
 *   ---
 *   key: value
 *   multiline:
 *     - item1
 *     - item2
 *   ---
 *   body content
 */

export interface FrontmatterResult {
  meta: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(content: string): FrontmatterResult | null {
  if (!content || typeof content !== 'string') {
    return null;
  }

  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/);
  if (!match) {
    return null;
  }

  const meta: Record<string, unknown> = {};
  const metaStr = match[1].trim();
  const body = match[2]?.trim() ?? '';

  if (!metaStr) {
    return null;
  }

  const lines = metaStr.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = line.substring(0, colonIdx).trim();
    if (!key) {
      i++;
      continue;
    }

    const rawValue = line.substring(colonIdx + 1).trim();

    // Check if this is a multi-line array (next line starts with -)
    if (!rawValue && i + 1 < lines.length && lines[i + 1].trim().startsWith('-')) {
      const arrayItems: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim().startsWith('-')) {
        const item = lines[i].trim().substring(1).trim();
        // Strip quotes from array items (e.g., "0 9 * * *" -> 0 9 * * *)
        const unquoted = item.replace(/^["']|["']$/g, '');
        arrayItems.push(unquoted);
        i++;
      }
      meta[key] = arrayItems;
    } else {
      meta[key] = parseFrontmatterValue(rawValue);
      i++;
    }
  }

  return { meta, body };
}

function parseFrontmatterValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;

  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  // Try to parse as number (integer or float)
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return value.replace(/^["']|["']$/g, '');
}

export function serializeFrontmatter(meta: Record<string, unknown>, body: string): string {
  const frontmatter = Object.entries(meta)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}:\n${value.map(v => `  - ${v}`).join('\n')}`;
      }
      return `${key}: ${typeof value === 'string' ? `"${value}"` : value}`;
    })
    .join('\n');

  return `---\n${frontmatter}\n---\n\n${body}\n`;
}
