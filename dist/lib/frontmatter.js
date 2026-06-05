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
/**
 * Parse YAML-ish frontmatter. The optional generic `T` lets callers declare the expected
 * meta shape — at runtime the parsed value is just cast (no validation), so callers should
 * still treat fields as optional unless they validate downstream (Zod, manual checks).
 */
export function parseFrontmatter(content) {
    if (!content || typeof content !== 'string') {
        return null;
    }
    const match = content.match(/^---\n([\s\S]*?)\n?---\n?([\s\S]*)/);
    if (!match) {
        return null;
    }
    const meta = {};
    const metaStr = match[1].trim();
    const body = match[2]?.trim() ?? '';
    // Empty frontmatter (e.g. `---\n---\n\n`) is valid — return empty meta + body so callers
    // can distinguish "no frontmatter wrapper" (parse returns null) from "wrapper but empty".
    if (!metaStr) {
        return { meta: {}, body };
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
            const arrayItems = [];
            i++;
            while (i < lines.length && lines[i].trim().startsWith('-')) {
                const item = lines[i].trim().substring(1).trim();
                // Strip quotes from array items (e.g., "0 9 * * *" -> 0 9 * * *)
                const unquoted = item.replace(/^["']|["']$/g, '');
                arrayItems.push(unquoted);
                i++;
            }
            meta[key] = arrayItems;
        }
        else {
            meta[key] = parseFrontmatterValue(rawValue);
            i++;
        }
    }
    return { meta: meta, body };
}
function parseFrontmatterValue(value) {
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    if (value.startsWith('[') && value.endsWith(']')) {
        try {
            return JSON.parse(value);
        }
        catch {
            return value;
        }
    }
    // Try to parse as number (integer or float)
    if (/^-?\d+(\.\d+)?$/.test(value)) {
        return Number(value);
    }
    return value.replace(/^["']|["']$/g, '');
}
export function serializeFrontmatter(meta, body) {
    const frontmatter = Object.entries(meta)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => formatEntry(key, value))
        .join('\n');
    return `---\n${frontmatter}\n---\n\n${body}\n`;
}
function formatEntry(key, value) {
    if (Array.isArray(value)) {
        if (value.length === 0)
            return `${key}: []`;
        if (value.every(v => typeof v === 'number')) {
            return `${key}: [${value.join(', ')}]`;
        }
        return `${key}:\n${value.map(v => `  - ${formatScalar(v)}`).join('\n')}`;
    }
    return `${key}: ${formatScalar(value)}`;
}
function formatScalar(value) {
    if (typeof value === 'boolean' || typeof value === 'number')
        return String(value);
    const s = String(value);
    return needsQuotes(s) ? `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : s;
}
function needsQuotes(s) {
    if (s === '')
        return true;
    if (/^(true|false|null|yes|no|on|off|~)$/i.test(s))
        return true;
    if (/^-?\d+(\.\d+)?$/.test(s))
        return true;
    // Starts with a YAML-special character or whitespace
    if (/^[\s!&*?|>%@`[\]{},#"'-]/.test(s))
        return true;
    // Contains ": ", " #", tab, or newline
    if (/:\s|\s#|\t|\n/.test(s))
        return true;
    // Trailing whitespace
    if (/\s$/.test(s))
        return true;
    // Contains chars conventionally quoted for safety (cron expressions, etc.)
    if (/[*?&!|>%`]/.test(s))
        return true;
    return false;
}
//# sourceMappingURL=frontmatter.js.map