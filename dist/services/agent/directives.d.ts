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
}
export declare function parseDirectives(text: string): ParsedDirectives;
//# sourceMappingURL=directives.d.ts.map