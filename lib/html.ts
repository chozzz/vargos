/**
 * Shared HTML utilities backed by turndown.
 * - stripHtml: simple tag stripping (for link expansion)
 * - htmlToMarkdown: proper conversion preserving links, headings, lists (for web.fetch)
 */

import TurndownService from 'turndown';

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
turndown.remove(['script', 'style', 'noscript']);

export function htmlToMarkdown(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.trim();
  const text = turndown.turndown(html).replace(/\n{3,}/g, '\n\n').trim();
  return title ? `# ${title}\n\n${text}` : text;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
