/**
 * Chat directives parser — extracts /think and /verbose prefixes from user messages.
 *
 * Directives must appear at the start of the message or after whitespace,
 * not inside URLs or as partial word matches.
 */

import type { ThinkingLevel } from '@earendil-works/pi-agent-core';

export interface ParsedDirectives {
  /** Message with all recognized directives stripped */
  cleaned: string;
  thinkingLevel?: ThinkingLevel;
  /** `/verbose` toggle — true to enable, false for `/verbose off`. Undefined when absent. */
  verbose?: boolean;
}

// Mirrors ThinkingLevelSchema.options from services/config/schemas/primitives.ts.
// Kept local to avoid lib/ → services/ import boundary violation.
const THINK_LEVELS = new Set<string>(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']);

// Matches /think or /t with optional colon, then a level word
const THINK_RE = /(?<![:/\w])\/(?:think|t)[:=\s]+(\w+)/gi;

// Matches /verbose with an optional on/off argument (bare /verbose enables it).
// The argument is restricted to explicit toggles so it never swallows a real word.
const VERBOSE_RE = /(?<![:/\w])\/verbose(?:[:=\s]+(on|off|true|false|yes|no|0|1))?/gi;

const VERBOSE_OFF = new Set<string>(['off', 'false', 'no', '0']);

export function parseDirectives(text: string): ParsedDirectives {
  let cleaned = text;
  let thinkingLevel: ThinkingLevel | undefined;
  let verbose: boolean | undefined;

  // Process /think directives — last match wins
  let match: RegExpExecArray | null;

  THINK_RE.lastIndex = 0;
  while ((match = THINK_RE.exec(text)) !== null) {
    const level = match[1].toLowerCase();
    if (THINK_LEVELS.has(level)) {
      thinkingLevel = level as ThinkingLevel;
    }
  }

  // Process /verbose directives — last match wins, bare directive enables it
  VERBOSE_RE.lastIndex = 0;
  while ((match = VERBOSE_RE.exec(text)) !== null) {
    const arg = match[1]?.toLowerCase();
    verbose = arg ? !VERBOSE_OFF.has(arg) : true;
  }

  // Strip matched directives from the cleaned string
  if (thinkingLevel !== undefined) {
    THINK_RE.lastIndex = 0;
    cleaned = cleaned.replace(THINK_RE, '');
  }
  if (verbose !== undefined) {
    VERBOSE_RE.lastIndex = 0;
    cleaned = cleaned.replace(VERBOSE_RE, '');
  }

  cleaned = cleaned.trim();

  return { cleaned, thinkingLevel, verbose };
}
