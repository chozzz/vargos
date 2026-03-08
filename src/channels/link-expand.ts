/**
 * Link expansion for inbound channel messages.
 * Fetches URLs found in message text and appends readable content.
 */

import { extractUrls, isAllowedUrl, fetchUrlContent } from '../lib/url-expand.js';
import type { LinkExpandConfig } from '../config/pi-config.js';

export type { LinkExpandConfig };

/**
 * Expand URLs in message content.
 * Returns enriched content, or the original if no URLs found or all fail.
 */
export async function expandLinks(content: string, config: LinkExpandConfig = {}): Promise<string> {
  if (config.enabled === false) return content;

  const { maxUrls = 3, maxCharsPerUrl = 8000, timeoutMs = 5000 } = config;

  const urls = extractUrls(content, maxUrls).filter(isAllowedUrl);
  if (urls.length === 0) return content;

  const results = await Promise.allSettled(
    urls.map((url) => fetchUrlContent(url, { maxChars: maxCharsPerUrl, timeoutMs })),
  );

  const expansions: string[] = [];
  for (const result of results) {
    if (result.status !== 'fulfilled' || result.value === null) continue;
    const { url, title, text } = result.value;
    const header = title ? `[Link: ${title} (${url})]` : `[Link: ${url}]`;
    expansions.push(`${header}\n${text}`);
  }

  if (expansions.length === 0) return content;

  return `${content}\n\n---\n[Expanded links]\n${expansions.join('\n\n')}`;
}
