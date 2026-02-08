import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createMessageDebouncer } from './debounce.js';

describe('createMessageDebouncer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should batch rapid messages and flush after delay', () => {
    const flushed: Array<{ key: string; messages: string[] }> = [];
    const debouncer = createMessageDebouncer(
      (key, messages) => flushed.push({ key, messages }),
      { delayMs: 500 },
    );

    debouncer.push('user1', 'hello');
    debouncer.push('user1', 'world');
    expect(flushed).toHaveLength(0);

    vi.advanceTimersByTime(500);
    expect(flushed).toHaveLength(1);
    expect(flushed[0].messages).toEqual(['hello', 'world']);
  });

  it('should reset timer on each new message', () => {
    const flushed: string[][] = [];
    const debouncer = createMessageDebouncer(
      (_, messages) => flushed.push(messages),
      { delayMs: 500 },
    );

    debouncer.push('u', 'a');
    vi.advanceTimersByTime(400);
    debouncer.push('u', 'b');
    vi.advanceTimersByTime(400);
    // Not flushed yet (400ms since last push)
    expect(flushed).toHaveLength(0);

    vi.advanceTimersByTime(100);
    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toEqual(['a', 'b']);
  });

  it('should force flush at maxBatch', () => {
    const flushed: string[][] = [];
    const debouncer = createMessageDebouncer(
      (_, messages) => flushed.push(messages),
      { delayMs: 5000, maxBatch: 3 },
    );

    debouncer.push('u', '1');
    debouncer.push('u', '2');
    debouncer.push('u', '3');
    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toEqual(['1', '2', '3']);
  });

  it('should handle multiple keys independently', () => {
    const flushed = new Map<string, string[]>();
    const debouncer = createMessageDebouncer(
      (key, messages) => flushed.set(key, messages),
      { delayMs: 500 },
    );

    debouncer.push('a', 'hi');
    debouncer.push('b', 'bye');
    vi.advanceTimersByTime(500);

    expect(flushed.get('a')).toEqual(['hi']);
    expect(flushed.get('b')).toEqual(['bye']);
  });

  it('should cancel pending flush', () => {
    const flushed: string[][] = [];
    const debouncer = createMessageDebouncer(
      (_, messages) => flushed.push(messages),
      { delayMs: 500 },
    );

    debouncer.push('u', 'msg');
    debouncer.cancel('u');
    vi.advanceTimersByTime(1000);
    expect(flushed).toHaveLength(0);
  });
});
