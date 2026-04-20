import { z } from 'zod';
import { register } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import { htmlToMarkdown } from '../../lib/html.js';
import { validateHttpResponse } from '../../lib/http-validate.js';

export class WebService {
  @register('web.fetch', {
    description: 'Fetch a URL and return readable content (HTML → markdown).',
    schema: z.object({
      url:         z.string().describe('HTTP or HTTPS URL'),
      extractMode: z.enum(['markdown', 'text']).optional().describe('Output format (default: markdown)'),
      maxChars:    z.number().optional().describe('Max characters to return (default: 50000)'),
    }),
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

    validateHttpResponse(resp, 'Web fetch');

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
  bus.bootstrap(new WebService());
  return {};
}
