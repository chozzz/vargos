import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractUrls, isAllowedUrl, fetchUrlContent } from './url-expand.js';

describe('extractUrls', () => {
  it('extracts URLs from text', () => {
    const urls = extractUrls('Check out https://example.com and http://foo.org/path');
    expect(urls).toEqual(['https://example.com', 'http://foo.org/path']);
  });

  it('deduplicates URLs', () => {
    const urls = extractUrls('https://example.com is great. See https://example.com again.');
    expect(urls).toEqual(['https://example.com']);
  });

  it('caps at maxUrls', () => {
    const text = 'https://a.com https://b.com https://c.com https://d.com';
    expect(extractUrls(text, 2)).toHaveLength(2);
    expect(extractUrls(text)).toHaveLength(3); // default 3
  });

  it('strips trailing punctuation', () => {
    const urls = extractUrls('Visit https://example.com. And https://foo.org, thanks!');
    expect(urls).toEqual(['https://example.com', 'https://foo.org']);
  });

  it('returns empty array when no URLs', () => {
    expect(extractUrls('no links here')).toEqual([]);
    expect(extractUrls('')).toEqual([]);
  });
});

describe('isAllowedUrl', () => {
  it('allows public https URLs', () => {
    expect(isAllowedUrl('https://example.com')).toBe(true);
    expect(isAllowedUrl('http://example.com/path?q=1')).toBe(true);
  });

  it('rejects localhost', () => {
    expect(isAllowedUrl('http://localhost:3000')).toBe(false);
    expect(isAllowedUrl('http://localhost/api')).toBe(false);
  });

  it('rejects 127.x.x.x', () => {
    expect(isAllowedUrl('http://127.0.0.1')).toBe(false);
    expect(isAllowedUrl('http://127.1.2.3')).toBe(false);
  });

  it('rejects 10.x.x.x', () => {
    expect(isAllowedUrl('http://10.0.0.1')).toBe(false);
    expect(isAllowedUrl('http://10.255.255.255')).toBe(false);
  });

  it('rejects 192.168.x.x', () => {
    expect(isAllowedUrl('http://192.168.1.1')).toBe(false);
  });

  it('rejects 172.16-31.x.x', () => {
    expect(isAllowedUrl('http://172.16.0.1')).toBe(false);
    expect(isAllowedUrl('http://172.31.255.255')).toBe(false);
    expect(isAllowedUrl('http://172.15.0.1')).toBe(true); // 172.15 is NOT private
    expect(isAllowedUrl('http://172.32.0.1')).toBe(true); // 172.32 is NOT private
  });

  it('rejects 169.254.x.x (link-local)', () => {
    expect(isAllowedUrl('http://169.254.0.1')).toBe(false);
  });

  it('rejects non-http schemes', () => {
    expect(isAllowedUrl('ftp://example.com')).toBe(false);
    expect(isAllowedUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedUrl('ws://example.com')).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isAllowedUrl('not-a-url')).toBe(false);
    expect(isAllowedUrl('')).toBe(false);
  });
});

describe('fetchUrlContent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(body: string, contentType: string, ok = true) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok,
      headers: { get: (h: string) => h === 'content-type' ? contentType : null },
      text: async () => body,
    }));
  }

  it('returns plain text content', async () => {
    mockFetch('Hello world', 'text/plain');
    const result = await fetchUrlContent('https://example.com');
    expect(result).not.toBeNull();
    expect(result!.text).toBe('Hello world');
    expect(result!.url).toBe('https://example.com');
  });

  it('extracts title from HTML', async () => {
    mockFetch('<html><head><title>My Page</title></head><body><p>Content</p></body></html>', 'text/html');
    const result = await fetchUrlContent('https://example.com');
    expect(result!.title).toBe('My Page');
    expect(result!.text).toContain('Content');
  });

  it('strips HTML tags', async () => {
    mockFetch('<html><body><script>alert(1)</script><p>Hello</p></body></html>', 'text/html');
    const result = await fetchUrlContent('https://example.com');
    expect(result!.text).not.toContain('<');
    expect(result!.text).not.toContain('alert');
    expect(result!.text).toContain('Hello');
  });

  it('truncates long content to maxChars', async () => {
    const longText = 'a'.repeat(20000);
    mockFetch(longText, 'text/plain');
    const result = await fetchUrlContent('https://example.com', { maxChars: 100 });
    expect(result!.text.length).toBe(100);
  });

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network fail')));
    const result = await fetchUrlContent('https://example.com');
    expect(result).toBeNull();
  });

  it('returns null on abort (timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('abort'), { name: 'AbortError' })));
    const result = await fetchUrlContent('https://example.com', { timeoutMs: 1 });
    expect(result).toBeNull();
  });

  it('returns null on non-200 response', async () => {
    mockFetch('Not Found', 'text/html', false);
    const result = await fetchUrlContent('https://example.com');
    expect(result).toBeNull();
  });

  it('returns null for non-text content type', async () => {
    mockFetch('binary', 'application/octet-stream');
    const result = await fetchUrlContent('https://example.com');
    expect(result).toBeNull();
  });
});
