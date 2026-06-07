import { describe, it, expect } from 'vitest';
import { parseDirectives } from '../directives.js';

describe('parseDirectives — /think', () => {
  it('parses a thinking level and strips it from the message', () => {
    const result = parseDirectives('/think high summarize the logs');
    expect(result.thinkingLevel).toBe('high');
    expect(result.cleaned).toBe('summarize the logs');
  });

  it('ignores an unknown level', () => {
    const result = parseDirectives('/think sideways do it');
    expect(result.thinkingLevel).toBeUndefined();
  });

  it('supports the /t short form with a colon', () => {
    const result = parseDirectives('/t:low keep it brief');
    expect(result.thinkingLevel).toBe('low');
    expect(result.cleaned).toBe('keep it brief');
  });
});

describe('parseDirectives — /verbose', () => {
  it('bare /verbose sets verbose: true and is stripped', () => {
    const result = parseDirectives('/verbose explain this');
    expect(result.verbose).toBe(true);
    expect(result.cleaned).toBe('explain this');
  });

  it('/verbose off sets verbose: false', () => {
    const result = parseDirectives('/verbose off explain this');
    expect(result.verbose).toBe(false);
    expect(result.cleaned).toBe('explain this');
  });

  it('absent /verbose leaves verbose undefined', () => {
    const result = parseDirectives('just a normal message');
    expect(result.verbose).toBeUndefined();
  });

  it('does not swallow a following non-toggle word', () => {
    const result = parseDirectives('/verbose summarize this');
    expect(result.verbose).toBe(true);
    expect(result.cleaned).toBe('summarize this');
  });

  it('accepts explicit on/true toggles', () => {
    expect(parseDirectives('/verbose on go').verbose).toBe(true);
    expect(parseDirectives('/verbose=true go').verbose).toBe(true);
  });

  it('accepts off-style toggles (off/false/no/0)', () => {
    for (const arg of ['off', 'false', 'no', '0']) {
      expect(parseDirectives(`/verbose ${arg} go`).verbose).toBe(false);
    }
  });

  it('is case-insensitive', () => {
    expect(parseDirectives('/VERBOSE OFF go').verbose).toBe(false);
  });

  it('last occurrence wins', () => {
    expect(parseDirectives('/verbose on then /verbose off').verbose).toBe(false);
  });

  it('combines with /think', () => {
    const result = parseDirectives('/think high /verbose run the task');
    expect(result.thinkingLevel).toBe('high');
    expect(result.verbose).toBe(true);
    expect(result.cleaned).toBe('run the task');
  });

  it('does not match /verbose inside a path or word', () => {
    const result = parseDirectives('open /etc/verbose and report');
    expect(result.verbose).toBeUndefined();
  });
});
