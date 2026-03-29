/**
 * Web tools: web_fetch
 * No bus calls needed — pure HTTP.
 */

import { z } from 'zod';
import type { Tool, ToolResult } from './types.js';
import { textResult, errorResult } from './types.js';
import { toMessage } from '../../lib/error.js';

const PRIVATE_IP_RE = /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|::1|fd[0-9a-f]{2}:)/i;

function isPrivate(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return PRIVATE_IP_RE.test(hostname);
  } catch {
    return false;
  }
}

/** Very basic HTML → plain text: strip tags, decode basic entities. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const webFetchTool: Tool = {
  name: 'web_fetch',
  description: 'Fetch a URL and return readable text content. Private/internal URLs are blocked.',
  parameters: z.object({
    url:         z.string().url().describe('URL to fetch'),
    extractMode: z.enum(['markdown', 'text']).optional().describe('Extraction mode (default: text)'),
    maxChars:    z.number().optional().describe('Max characters to return (default: 8000)'),
  }),
  formatCall: (args) => String(args.url || '').slice(0, 100),
  async execute(args: unknown): Promise<ToolResult> {
    const p = (z.object({
      url:         z.string().url(),
      extractMode: z.enum(['markdown', 'text']).optional(),
      maxChars:    z.number().optional(),
    })).parse(args);

    if (isPrivate(p.url)) return errorResult(`Blocked: private/internal URL — ${p.url}`);

    try {
      const res = await fetch(p.url, {
        headers: { 'User-Agent': 'Vargos/2 (+https://github.com/chozzz/vargos)' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) return errorResult(`HTTP ${res.status}: ${res.statusText}`);

      const ct   = res.headers.get('content-type') ?? '';
      const body = await res.text();
      const text = ct.includes('text/html') ? htmlToText(body) : body;
      const max  = p.maxChars ?? 8_000;

      return textResult(text.slice(0, max) + (text.length > max ? `\n\n[Truncated at ${max} chars]` : ''));
    } catch (err) {
      return errorResult(`fetch failed: ${toMessage(err)}`);
    }
  },
};
