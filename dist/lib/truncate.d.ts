/**
 * Truncate large text content using head/tail strategy.
 * Keeps 70% from start, 20% from end, with ellipsis indicator in middle.
 *
 * Useful for: log entries, large files, prompt sections, debug output.
 *
 * Example:
 *   truncate("very long text...", 100) → "start text...\n\n[...truncated...]\n\n...text"
 */
export declare function truncate(content: string, maxChars: number): string;
//# sourceMappingURL=truncate.d.ts.map