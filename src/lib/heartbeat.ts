/**
 * Heartbeat utilities — pure functions for heartbeat poll logic
 */

import type { ActiveHoursConfig } from '../config/pi-config.js';

/**
 * Returns true if HEARTBEAT.md content has no actionable tasks.
 * Skips blank lines, markdown headers, empty list items, and HTML comments.
 */
export function isHeartbeatContentEffectivelyEmpty(content: string): boolean {
  const lines = content.split('\n');
  for (const line of lines) {
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

/**
 * Check if current time is within active hours.
 * Returns true if no config (always active).
 * Supports overnight ranges (e.g. 22:00→06:00).
 */
export function isWithinActiveHours(config?: ActiveHoursConfig): boolean {
  if (!config) return true;

  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: config.timezone,
  });

  const currentTime = formatter.format(now); // "HH:MM"
  const { start, end } = config;

  if (start <= end) {
    // Normal range: 09:00→17:00
    return currentTime >= start && currentTime < end;
  }
  // Overnight range: 22:00→06:00
  return currentTime >= start || currentTime < end;
}
