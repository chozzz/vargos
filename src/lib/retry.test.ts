import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from './retry.js';

describe('withRetry', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns result immediately on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries after failure and returns on eventual success', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { maxRetries: 2, baseMs: 100, jitter: false });
    await vi.runAllTimersAsync();

    expect(await promise).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('rethrows immediately when shouldRetry returns false', async () => {
    const fatal = new Error('fatal');
    const fn = vi.fn().mockRejectedValue(fatal);

    await expect(
      withRetry(fn, { shouldRetry: () => false }),
    ).rejects.toThrow('fatal');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('only retries errors where shouldRetry returns true', async () => {
    class RetryableError extends Error {}
    class FatalError extends Error {}

    const fn = vi.fn()
      .mockRejectedValueOnce(new RetryableError('transient'))
      .mockRejectedValue(new FatalError('fatal'));

    const shouldRetry = (err: unknown) => err instanceof RetryableError;

    const assertion = expect(
      withRetry(fn, { maxRetries: 3, baseMs: 10, jitter: false, shouldRetry }),
    ).rejects.toBeInstanceOf(FatalError);
    await vi.runAllTimersAsync();
    await assertion;

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('exhausts maxRetries and rethrows last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    const assertion = expect(
      withRetry(fn, { maxRetries: 3, baseMs: 10, jitter: false }),
    ).rejects.toThrow('always fails');
    await vi.runAllTimersAsync();
    await assertion;

    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('zero maxRetries means no retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(
      withRetry(fn, { maxRetries: 0 }),
    ).rejects.toThrow('fail');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('aborts during wait between retries', async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    const assertion = expect(
      withRetry(fn, { maxRetries: 5, baseMs: 5000, jitter: false, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    // Abort while waiting for backoff delay
    controller.abort();
    await vi.runAllTimersAsync();
    await assertion;

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('aborts immediately if signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    const promise = withRetry(fn, {
      maxRetries: 3,
      signal: controller.signal,
    });

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    // fn still called once — abort is checked after the failure
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('delays increase exponentially', async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;

    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms, ...args) => {
      if (typeof ms === 'number') delays.push(ms);
      return originalSetTimeout(fn, 0, ...args);
    });

    const fail = vi.fn().mockRejectedValue(new Error('fail'));
    const assertion = withRetry(fail, { maxRetries: 3, baseMs: 100, maxMs: 10_000, jitter: false }).catch(() => {});
    await vi.runAllTimersAsync();
    await assertion;

    vi.restoreAllMocks();

    expect(delays).toHaveLength(3);
    expect(delays[0]).toBe(100);   // 100 * 2^0
    expect(delays[1]).toBe(200);   // 100 * 2^1
    expect(delays[2]).toBe(400);   // 100 * 2^2
  });

  it('caps delay at maxMs', async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;

    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms, ...args) => {
      if (typeof ms === 'number') delays.push(ms);
      return originalSetTimeout(fn, 0, ...args);
    });

    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const assertion = withRetry(fn, { maxRetries: 4, baseMs: 1000, maxMs: 2000, jitter: false }).catch(() => {});
    await vi.runAllTimersAsync();
    await assertion;

    vi.restoreAllMocks();

    expect(delays[0]).toBe(1000);
    expect(delays[1]).toBe(2000); // capped
    expect(delays[2]).toBe(2000); // still capped
    expect(delays[3]).toBe(2000);
  });

  it('works with all defaults', async () => {
    const fn = vi.fn().mockResolvedValue('default');
    const result = await withRetry(fn);
    expect(result).toBe('default');
  });
});
