import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createDedupeCache } from './dedupe.js';

describe('createDedupeCache', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should detect duplicate keys', () => {
    const cache = createDedupeCache();
    expect(cache.add('msg-1')).toBe(true);
    expect(cache.add('msg-1')).toBe(false);
    expect(cache.has('msg-1')).toBe(true);
  });

  it('should expire entries after TTL', () => {
    const cache = createDedupeCache({ ttlMs: 1000 });
    cache.add('msg-1');
    expect(cache.has('msg-1')).toBe(true);

    vi.advanceTimersByTime(1001);
    expect(cache.has('msg-1')).toBe(false);
  });

  it('should evict oldest when maxSize exceeded', () => {
    const cache = createDedupeCache({ maxSize: 3 });
    cache.add('a');
    cache.add('b');
    cache.add('c');
    cache.add('d'); // should evict 'a'
    expect(cache.has('a')).toBe(false);
    expect(cache.has('d')).toBe(true);
  });

  it('should clear all entries', () => {
    const cache = createDedupeCache();
    cache.add('a');
    cache.add('b');
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
