import { describe, it, expect, vi, afterEach } from 'vitest';
import { expandLinks } from './link-expand.js';

function mockFetch(responses: Record<string, { body: string; contentType: string; ok?: boolean } | null>) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    const entry = responses[url];
    if (!entry) return Promise.reject(new Error('network fail'));
    if (entry === null) return Promise.reject(new Error('network fail'));
    const { body, contentType, ok = true } = entry;
    return Promise.resolve({
      ok,
      headers: { get: (h: string) => h === 'content-type' ? contentType : null },
      text: async () => body,
    });
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('expandLinks', () => {
  it('expands a single URL', async () => {
    mockFetch({
      'https://example.com': { body: '<title>Example</title><p>Hello</p>', contentType: 'text/html' },
    });

    const result = await expandLinks('Check this out https://example.com');
    expect(result).toContain('[Expanded links]');
    expect(result).toContain('[Link: Example (https://example.com)]');
    expect(result).toContain('Hello');
    expect(result).toContain('Check this out https://example.com');
  });

  it('expands multiple URLs', async () => {
    mockFetch({
      'https://a.com': { body: 'Page A', contentType: 'text/plain' },
      'https://b.com': { body: 'Page B', contentType: 'text/plain' },
    });

    const result = await expandLinks('See https://a.com and https://b.com');
    expect(result).toContain('[Link: https://a.com]');
    expect(result).toContain('[Link: https://b.com]');
    expect(result).toContain('Page A');
    expect(result).toContain('Page B');
  });

  it('returns original when no URLs in content', async () => {
    const original = 'No links here at all';
    const result = await expandLinks(original);
    expect(result).toBe(original);
  });

  it('returns original when disabled', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const original = 'See https://example.com';
    const result = await expandLinks(original, { enabled: false });
    expect(result).toBe(original);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('returns original when all fetches fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network fail')));
    const original = 'See https://example.com';
    const result = await expandLinks(original);
    expect(result).toBe(original);
  });

  it('returns partial expansion when some fetches fail', async () => {
    mockFetch({
      'https://good.com': { body: 'Good content', contentType: 'text/plain' },
      // https://bad.com is not in the mock → will throw
    });

    const result = await expandLinks('https://good.com and https://bad.com');
    expect(result).toContain('Good content');
    expect(result).not.toContain('[Link: https://bad.com]');
  });

  it('respects maxUrls limit', async () => {
    mockFetch({
      'https://a.com': { body: 'A', contentType: 'text/plain' },
      'https://b.com': { body: 'B', contentType: 'text/plain' },
      'https://c.com': { body: 'C', contentType: 'text/plain' },
    });

    const result = await expandLinks(
      'https://a.com https://b.com https://c.com',
      { maxUrls: 2 },
    );
    const count = (result.match(/\[Link:/g) ?? []).length;
    expect(count).toBe(2);
  });

  it('does not expand private/internal URLs', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const result = await expandLinks('http://localhost:3000/api and http://192.168.1.1');
    expect(result).not.toContain('[Expanded links]');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
