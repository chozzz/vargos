/**
 * Strip markdown formatting for plain-text channels (WhatsApp, Telegram).
 * Preserves content, removes syntax characters.
 */

/** Remove markdown formatting, preserving readable plain text. */
export function stripMarkdown(text: string): string {
  return text
    // Headers: "## Heading" → "Heading"
    .replace(/^#{1,6}\s+/gm, '')
    // Bold/italic: **text**, __text__, *text*, _text_
    .replace(/(\*{1,3}|_{1,3})(.+?)\1/g, '$2')
    // Strikethrough: ~~text~~
    .replace(/~~(.+?)~~/g, '$1')
    // Code blocks: ```lang\ncode\n``` → code (must come before inline code)
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '$1')
    // Inline code: `code`
    .replace(/`([^`]+)`/g, '$1')
    // Links: [text](url) → text (url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    // Images: ![alt](url) → alt
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Unordered list markers: "- item" or "* item" → "• item"
    .replace(/^[\t ]*[-*+]\s+/gm, '• ')
    // Blockquotes: "> text" → "text"
    .replace(/^>\s?/gm, '')
    // Collapse 3+ newlines to 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
