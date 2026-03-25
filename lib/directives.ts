/**
 * Chat directives parser — extracts /think and /verbose prefixes from user messages.
 *
 * Directives must appear at the start of the message or after whitespace,
 * not inside URLs or as partial word matches.
 */

export type ThinkLevel = 'off' | 'low' | 'medium' | 'high';

export interface ParsedDirectives {
  /** Message with all recognized directives stripped */
  cleaned: string;
  thinkingLevel?: ThinkLevel;
  verbose?: boolean;
}

const THINK_LEVELS = new Set<ThinkLevel>(['off', 'low', 'medium', 'high']);

// Matches /think or /t with optional colon, then a level word
const THINK_RE = /(?<![:/\w])\/(?:think|t)[:=\s]+(\w+)/gi;

// Matches /verbose or /v with optional colon and optional on/off
const VERBOSE_RE = /(?<![:/\w])\/(?:verbose|v)(?:[:=\s]+(on|off))?(?=\s|$)/gi;

function isThinkLevel(v: string): v is ThinkLevel {
  return THINK_LEVELS.has(v as ThinkLevel);
}

export function parseDirectives(text: string): ParsedDirectives {
  let cleaned = text;
  let thinkingLevel: ThinkLevel | undefined;
  let verbose: boolean | undefined;

  // Process /think directives — last match wins
  let match: RegExpExecArray | null;

  THINK_RE.lastIndex = 0;
  while ((match = THINK_RE.exec(text)) !== null) {
    const level = match[1].toLowerCase();
    if (isThinkLevel(level)) {
      thinkingLevel = level;
    }
  }

  VERBOSE_RE.lastIndex = 0;
  while ((match = VERBOSE_RE.exec(text)) !== null) {
    const val = match[1]?.toLowerCase();
    // /verbose or /verbose on → true, /verbose off → false
    verbose = val !== 'off';
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
