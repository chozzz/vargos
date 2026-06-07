/**
 * URL extraction and content fetching utilities.
 * No domain imports — safe to use from any layer.
 */
/** Extract unique http/https URLs from text, up to maxUrls (default 3). */
export declare function extractUrls(text: string, maxUrls?: number): string[];
/** Return false for private/internal addresses, non-http schemes, or invalid URLs. */
export declare function isAllowedUrl(url: string): boolean;
export interface FetchedContent {
    url: string;
    title?: string;
    text: string;
}
/**
 * Fetch URL, convert HTML to readable text, truncate to maxChars.
 * Returns null on any error — never throws.
 */
export declare function fetchUrlContent(url: string, opts?: {
    maxChars?: number;
    timeoutMs?: number;
}): Promise<FetchedContent | null>;
//# sourceMappingURL=url-expand.d.ts.map