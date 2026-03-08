import { describe, it, expect } from 'vitest';
import { parseDirectives } from './directives.js';

describe('parseDirectives', () => {
  describe('think directive', () => {
    it('/think high hello world', () => {
      const result = parseDirectives('/think high hello world');
      expect(result.thinkingLevel).toBe('high');
      expect(result.cleaned).toBe('hello world');
    });

    it('/think off do this', () => {
      const result = parseDirectives('/think off do this');
      expect(result.thinkingLevel).toBe('off');
      expect(result.cleaned).toBe('do this');
    });

    it('/think low with task', () => {
      const result = parseDirectives('/think low analyse this');
      expect(result.thinkingLevel).toBe('low');
      expect(result.cleaned).toBe('analyse this');
    });

    it('/think medium with task', () => {
      const result = parseDirectives('/think medium summarise');
      expect(result.thinkingLevel).toBe('medium');
      expect(result.cleaned).toBe('summarise');
    });

    it('/t high shorthand', () => {
      const result = parseDirectives('/t high quick');
      expect(result.thinkingLevel).toBe('high');
      expect(result.cleaned).toBe('quick');
    });

    it('/think:high colon separator', () => {
      const result = parseDirectives('/think:high run');
      expect(result.thinkingLevel).toBe('high');
      expect(result.cleaned).toBe('run');
    });

    it('unknown think level is ignored', () => {
      const result = parseDirectives('/think ultra do this');
      expect(result.thinkingLevel).toBeUndefined();
    });
  });

  describe('verbose directive', () => {
    it('/verbose on tell me', () => {
      const result = parseDirectives('/verbose on tell me');
      expect(result.verbose).toBe(true);
      expect(result.cleaned).toBe('tell me');
    });

    it('/verbose off suppresses verbosity', () => {
      const result = parseDirectives('/verbose off tell me');
      expect(result.verbose).toBe(false);
      expect(result.cleaned).toBe('tell me');
    });

    it('/verbose alone defaults to true', () => {
      const result = parseDirectives('/verbose');
      expect(result.verbose).toBe(true);
      expect(result.cleaned).toBe('');
    });

    it('/v shorthand defaults to true', () => {
      const result = parseDirectives('/v hello');
      expect(result.verbose).toBe(true);
      expect(result.cleaned).toBe('hello');
    });
  });

  describe('combined directives', () => {
    it('/think high /verbose do this', () => {
      const result = parseDirectives('/think high /verbose do this');
      expect(result.thinkingLevel).toBe('high');
      expect(result.verbose).toBe(true);
      expect(result.cleaned).toBe('do this');
    });

    it('/verbose /think medium task', () => {
      const result = parseDirectives('/verbose /think medium task');
      expect(result.verbose).toBe(true);
      expect(result.thinkingLevel).toBe('medium');
      expect(result.cleaned).toBe('task');
    });

    it('last directive per type wins', () => {
      const result = parseDirectives('/think low /think high do it');
      expect(result.thinkingLevel).toBe('high');
      expect(result.cleaned).toBe('do it');
    });
  });

  describe('no-match cases', () => {
    it('URL path segment is not matched', () => {
      const input = 'check https://example.com/think/stuff';
      const result = parseDirectives(input);
      expect(result.thinkingLevel).toBeUndefined();
      expect(result.cleaned).toBe(input);
    });

    it('/thinkstuff does not match (no word boundary)', () => {
      const input = '/thinkstuff do something';
      const result = parseDirectives(input);
      expect(result.thinkingLevel).toBeUndefined();
      expect(result.cleaned).toBe(input);
    });

    it('/unknown passes through unchanged', () => {
      const input = '/unknown do this';
      const result = parseDirectives(input);
      expect(result.thinkingLevel).toBeUndefined();
      expect(result.verbose).toBeUndefined();
      expect(result.cleaned).toBe(input);
    });

    it('plain message with no directives is unchanged', () => {
      const input = 'just a normal message';
      const result = parseDirectives(input);
      expect(result.thinkingLevel).toBeUndefined();
      expect(result.verbose).toBeUndefined();
      expect(result.cleaned).toBe(input);
    });

    it('only directive remains — cleaned is empty string', () => {
      const result = parseDirectives('/think high');
      expect(result.thinkingLevel).toBe('high');
      expect(result.cleaned).toBe('');
    });
  });
});
