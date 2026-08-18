
// Matches HEARTBEAT_OK with optional markdown wrapping (bold, backtick, strikethrough)
const HEARTBEAT_TOKEN_RE = /(?:\*{1,2}|`|~~)?HEARTBEAT_OK(?:\*{1,2}|`|~~)?/g;

/**
 * Returns true if HEARTBEAT.md content has no actionable tasks.
 * Skips blank lines, markdown headers, empty list items, and HTML comments.
 */
export function isHeartbeatContentEffectivelyEmpty(content: string): boolean {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    if (trimmed === '-' || trimmed === '- [ ]') continue;
    if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) continue;
    return false;
  }
  return true;
}

/**
 * Strip HEARTBEAT_OK token from response text.
 * Returns null if the entire response was only the token (signal to skip delivery).
 * Returns cleaned text otherwise.
 */
export function stripHeartbeatToken(text: string): string | null {
  const stripped = text.replace(HEARTBEAT_TOKEN_RE, '').trim();
  if (!stripped) return null;
  return stripped;
}
