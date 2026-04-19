/**
 * Chat directives parser — extracts /think and /verbose prefixes from user messages.
 *
 * Directives must appear at the start of the message or after whitespace,
 * not inside URLs or as partial word matches.
 */

import type { ThinkingLevel } from '@mariozechner/pi-agent-core';

export interface ParsedDirectives {
  /** Message with all recognized directives stripped */
  cleaned: string;
  thinkingLevel?: ThinkingLevel;
}

// Mirrors ThinkingLevelSchema.options from services/config/schemas/primitives.ts.
// Kept local to avoid lib/ → services/ import boundary violation.
const THINK_LEVELS = new Set<string>(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']);

// Matches /think or /t with optional colon, then a level word
const THINK_RE = /(?<![:/\w])\/(?:think|t)[:=\s]+(\w+)/gi;

export function parseDirectives(text: string): ParsedDirectives {
  let cleaned = text;
  let thinkingLevel: ThinkingLevel | undefined;

  // Process /think directives — last match wins
  let match: RegExpExecArray | null;

  THINK_RE.lastIndex = 0;
  while ((match = THINK_RE.exec(text)) !== null) {
    const level = match[1].toLowerCase();
    if (THINK_LEVELS.has(level)) {
      thinkingLevel = level as ThinkingLevel;
    }
  }

  // Strip matched directives from the cleaned string
  if (thinkingLevel !== undefined) {
    THINK_RE.lastIndex = 0;
    cleaned = cleaned.replace(THINK_RE, '');
  }

  cleaned = cleaned.trim();

  return { cleaned, thinkingLevel };
}
