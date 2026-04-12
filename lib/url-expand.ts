/**
 * URL extraction and content fetching utilities.
 * No domain imports — safe to use from any layer.
 */

import { stripHtml } from './html.js';

const PRIVATE_HOSTNAME_RE = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|\[::1\])$/i;

/** Extract unique http/https URLs from text, up to maxUrls (default 3). */
export function extractUrls(text: string, maxUrls = 3): string[] {
  const matches = text.match(/https?:\/\/[^\s<>[\]()]+/g) ?? [];
  const seen = new Set<string>();
  const results: string[] = [];

  for (const raw of matches) {
    // Strip trailing punctuation that's almost never part of a URL
    const url = raw.replace(/[.,;:!?]+$/, '');
    if (!seen.has(url)) {
      seen.add(url);
      results.push(url);
      if (results.length >= maxUrls) break;
    }
  }

  return results;
}

/** Return false for private/internal addresses, non-http schemes, or invalid URLs. */
export function isAllowedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const hostname = parsed.hostname;
  return !PRIVATE_HOSTNAME_RE.test(hostname);
}

export interface FetchedContent {
  url: string;
  title?: string;
  text: string;
}

/**
 * Fetch URL, convert HTML to readable text, truncate to maxChars.
 * Returns null on any error — never throws.
 */
export async function fetchUrlContent(
  url: string,
  opts: { maxChars?: number; timeoutMs?: number } = {},
): Promise<FetchedContent | null> {
  const { maxChars = 8000, timeoutMs = 5000 } = opts;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') ?? '';
    const isHtml = contentType.includes('text/html');
    const isText = contentType.includes('text/plain') || contentType.includes('text/markdown');

    if (!isHtml && !isText) return null;

    const raw = await response.text();

    if (isHtml) {
      const titleMatch = raw.match(/<title[^>]*>([^<]*)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : undefined;
      const text = stripHtml(raw).slice(0, maxChars);
      return { url, title, text };
    }

    return { url, text: raw.slice(0, maxChars) };
  } catch {
    return null;
  }
}
