/**
 * Heartbeat utilities — pure functions for heartbeat poll logic
 */

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

// Matches HEARTBEAT_OK with optional markdown wrapping (bold, backtick, strikethrough)
const HEARTBEAT_TOKEN_RE = /(?:\*{1,2}|`|~~)?HEARTBEAT_OK(?:\*{1,2}|`|~~)?/g;

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

function currentHourInZone(timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
  const hourPart = parts.find(p => p.type === 'hour');
  return parseInt(hourPart?.value ?? '0', 10);
}

/**
 * Check if the current hour is within active hours.
 * Returns true if no config (always active).
 * Supports overnight ranges (e.g. 22→6).
 *
 * @param activeHours [startHour, endHour] (0–23). Interpreted in `timeZone` when set, else UTC.
 */
export function isWithinActiveHours(
  activeHours?: [number, number],
  timeZone?: string,
): boolean {
  if (!activeHours) return true;
  const [start, end] = activeHours;
  const hour = timeZone ? currentHourInZone(timeZone) : new Date().getUTCHours();
  if (start <= end) return hour >= start && hour < end;
  // Overnight: e.g. [22, 6] → active 22:00→06:00
  return hour >= start || hour < end;
}
