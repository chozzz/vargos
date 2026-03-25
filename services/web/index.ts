import { z } from 'zod';
import { on } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import { toMessage } from '../../lib/error.js';

export class WebService {
  @on('web.fetch', {
    description: 'Fetch a URL and return readable content (HTML → markdown).',
    schema: z.object({
      url:         z.string().describe('HTTP or HTTPS URL'),
      extractMode: z.enum(['markdown', 'text']).optional().describe('Output format (default: markdown)'),
      maxChars:    z.number().optional().describe('Max characters to return (default: 50000)'),
    }),
    format: (r) => (r as EventMap['web.fetch']['result']).text.slice(0, 120) + '…',
  })
  async fetch(params: EventMap['web.fetch']['params']): Promise<EventMap['web.fetch']['result']> {
    let url: URL;
    try { url = new URL(params.url); }
    catch { throw new Error('Invalid URL'); }

    if (!['http:', 'https:'].includes(url.protocol))
      throw new Error('Only http/https URLs are supported');

    const resp = await fetch(params.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Vargos/2.0)' },
      redirect: 'follow',
    });

    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

    const contentType = resp.headers.get('content-type') ?? '';
    const html        = await resp.text();
    const maxChars    = params.maxChars ?? 50_000;

    let text = contentType.includes('text/html') ? htmlToMarkdown(html) : html;
    if (params.extractMode === 'text') text = stripMarkdownLinks(text);

    const truncated = text.length > maxChars;
    if (truncated) text = text.slice(0, maxChars) + '\n… (truncated)';

    return { text };
  }
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

function htmlToMarkdown(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.trim();

  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_, href, body) => body.trim() ? `[${body.trim()}](${href})` : href)
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_, l, body) => `\n${'#'.repeat(+l)} ${body.trim()}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi,
      (_, body) => body.trim() ? `\n- ${body.trim()}` : '')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|header|footer)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ').trim();

  return title ? `# ${title}\n\n${text}` : text;
}

function stripMarkdownLinks(md: string): string {
  return md
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

// ── Boot ─────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop?(): void }> {
  bus.registerService(new WebService());
  return {};
}
