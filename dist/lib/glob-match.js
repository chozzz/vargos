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
export function matchesGlob(pattern, str) {
    if (!pattern.includes('*'))
        return pattern === str;
    const re = new RegExp('^' + pattern.split('*').map(escapeRegex).join('.*') + '$');
    return re.test(str);
}
function escapeRegex(s) {
    return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=glob-match.js.map