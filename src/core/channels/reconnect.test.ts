import { describe, it, expect } from 'vitest';
import { Reconnector } from './reconnect.js';

describe('Reconnector', () => {
  it('returns exponential backoff delays', () => {
    const r = new Reconnector({ baseMs: 100, maxMs: 10_000, maxAttempts: 5 });
    expect(r.next()).toBe(100);   // 100 * 2^0
    expect(r.next()).toBe(200);   // 100 * 2^1
    expect(r.next()).toBe(400);   // 100 * 2^2
    expect(r.next()).toBe(800);   // 100 * 2^3
    expect(r.next()).toBe(1600);  // 100 * 2^4
  });

  it('caps delay at maxMs', () => {
    const r = new Reconnector({ baseMs: 1000, maxMs: 5000, maxAttempts: 10 });
    r.next(); // 1000
    r.next(); // 2000
    r.next(); // 4000
    expect(r.next()).toBe(5000); // capped
    expect(r.next()).toBe(5000); // still capped
  });

  it('returns null after maxAttempts', () => {
    const r = new Reconnector({ baseMs: 100, maxMs: 1000, maxAttempts: 3 });
    expect(r.next()).toBe(100);
    expect(r.next()).toBe(200);
    expect(r.next()).toBe(400);
    expect(r.next()).toBeNull();
    expect(r.next()).toBeNull(); // stays exhausted
  });

  it('reset restores attempts', () => {
    const r = new Reconnector({ baseMs: 100, maxMs: 1000, maxAttempts: 2 });
    r.next();
    r.next();
    expect(r.next()).toBeNull();

    r.reset();
    expect(r.attempts).toBe(0);
    expect(r.next()).toBe(100); // fresh
  });

  it('uses defaults when no config provided', () => {
    const r = new Reconnector();
    expect(r.next()).toBe(2000);  // default baseMs
    expect(r.next()).toBe(4000);
  });
});
