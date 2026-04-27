/**
 * Truncate large text content using head/tail strategy.
 * Keeps 70% from start, 20% from end, with ellipsis indicator in middle.
 *
 * Useful for: log entries, large files, prompt sections, debug output.
 *
 * Example:
 *   truncate("very long text...", 100) → "start text...\n\n[...truncated...]\n\n...text"
 */

export function truncate(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;

  const headChars = Math.floor(maxChars * 0.7);
  const tailChars = Math.floor(maxChars * 0.2);

  return `${content.slice(0, headChars)}\n\n[...truncated...]\n\n${content.slice(-tailChars)}`;
}
