/**
 * Link expansion for inbound channel messages.
 * Fetches URLs found in message text and appends readable content.
 */

import { extractUrls, isAllowedUrl, fetchUrlContent } from '../../lib/url-expand.js';
import type { LinkExpandConfig } from '../../services/config/index.js';

export type { LinkExpandConfig };

export async function expandLinks(content: string, config?: LinkExpandConfig): Promise<string> {
  if (!config) return content;
  if (config.enabled === false) return content;

  const { maxUrls, maxCharsPerUrl, timeoutMs } = config;

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
