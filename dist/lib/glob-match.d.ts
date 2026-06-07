/**
 * Match a string against a glob pattern. Only `*` wildcard is supported (matches any
 * characters, zero or more). Patterns without `*` must match exactly. Other regex
 * specials in the pattern are escaped.
 *
 * Examples:
 *   matchesGlob('memory.*', 'memory.search')      // true
 *   matchesGlob('memory.*', 'channel.send')       // false
 *   matchesGlob('mcp.atlassian.*', 'mcp.atlassian.create_issue')  // true
 *   matchesGlob('*', 'anything')                  // true
 *   matchesGlob('exact', 'exact')                 // true
 */
export declare function matchesGlob(pattern: string, str: string): boolean;
//# sourceMappingURL=glob-match.d.ts.map