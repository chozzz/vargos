import { describe, it, expect } from 'vitest';
import { extractTextContent, isThinkingOnlyContent, isRetryableError } from './runtime.js';

describe('extractTextContent', () => {
  it('returns string content as-is', () => {
    expect(extractTextContent('hello world')).toBe('hello world');
  });

  it('extracts text blocks from content array', () => {
    const content = [
      { type: 'text', text: 'Hello' },
      { type: 'text', text: 'World' },
    ];
    expect(extractTextContent(content)).toBe('Hello\nWorld');
  });

  it('skips thinking blocks', () => {
    const content = [
      { type: 'thinking', text: 'Let me reason about this...' },
      { type: 'text', text: 'The answer is 42.' },
    ];
    expect(extractTextContent(content)).toBe('The answer is 42.');
  });

  it('skips empty text blocks', () => {
    const content = [
      { type: 'text', text: '' },
      { type: 'text', text: 'actual content' },
    ];
    expect(extractTextContent(content)).toBe('actual content');
  });

  it('returns empty string for thinking-only array', () => {
    const content = [
      { type: 'thinking', text: 'reasoning...' },
    ];
    expect(extractTextContent(content)).toBe('');
  });

  it('extracts text from plain object with text field', () => {
    expect(extractTextContent({ text: 'plain object' })).toBe('plain object');
  });

  it('handles empty array', () => {
    expect(extractTextContent([])).toBe('');
  });

  it('stringifies unexpected types', () => {
    expect(extractTextContent(42)).toBe('42');
  });
});

describe('isThinkingOnlyContent', () => {
  it('returns false for non-array input', () => {
    expect(isThinkingOnlyContent('hello')).toBe(false);
    expect(isThinkingOnlyContent(null)).toBe(false);
    expect(isThinkingOnlyContent(42)).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(isThinkingOnlyContent([])).toBe(false);
  });

  it('returns true for single thinking block', () => {
    expect(isThinkingOnlyContent([
      { type: 'thinking', text: 'Let me think about this...' },
    ])).toBe(true);
  });

  it('returns true for thinking + empty text blocks', () => {
    expect(isThinkingOnlyContent([
      { type: 'thinking', text: 'reasoning...' },
      { type: 'text', text: '' },
      { type: 'text', text: '   ' },
    ])).toBe(true);
  });

  it('returns false when any text block has content', () => {
    expect(isThinkingOnlyContent([
      { type: 'thinking', text: 'reasoning...' },
      { type: 'text', text: 'The answer is 42.' },
    ])).toBe(false);
  });

  it('returns false for tool_use blocks', () => {
    expect(isThinkingOnlyContent([
      { type: 'thinking', text: 'reasoning...' },
      { type: 'tool_use', text: '' },
    ])).toBe(false);
  });

  it('returns false for content with only text blocks (non-empty)', () => {
    expect(isThinkingOnlyContent([
      { type: 'text', text: 'Hello world' },
    ])).toBe(false);
  });
});

describe('isRetryableError', () => {
  it('returns false for undefined/empty', () => {
    expect(isRetryableError(undefined)).toBe(false);
    expect(isRetryableError('')).toBe(false);
  });

  it('retries network connection lost', () => {
    expect(isRetryableError('Network connection lost.')).toBe(true);
    expect(isRetryableError('network connection lost')).toBe(true);
  });

  it('retries JSON parse errors', () => {
    expect(isRetryableError('Unexpected end of JSON input')).toBe(true);
    expect(isRetryableError('Unexpected token after JSON at position 0')).toBe(true);
    expect(isRetryableError('something after JSON data')).toBe(true);
  });

  it('retries Node.js network errors', () => {
    expect(isRetryableError('read ECONNRESET')).toBe(true);
    expect(isRetryableError('connect ECONNREFUSED 127.0.0.1:443')).toBe(true);
    expect(isRetryableError('connect ETIMEDOUT')).toBe(true);
    expect(isRetryableError('socket hang up')).toBe(true);
    expect(isRetryableError('fetch failed')).toBe(true);
  });

  it('retries HTTP 502/503/529 errors', () => {
    expect(isRetryableError('Request failed with status 502')).toBe(true);
    expect(isRetryableError('503 Service Unavailable')).toBe(true);
    expect(isRetryableError('Error 529: overloaded')).toBe(true);
  });

  it('retries generic network error', () => {
    expect(isRetryableError('network error')).toBe(true);
  });

  it('matches "unexpected token" JSON parse errors', () => {
    expect(isRetryableError('Unexpected token < in JSON at position 0')).toBe(true);
    expect(isRetryableError('unexpected token u in JSON')).toBe(true);
  });

  it('does not retry abort errors (intentional cancellation)', () => {
    expect(isRetryableError('The operation was aborted')).toBe(false);
    expect(isRetryableError('AbortError: signal is aborted')).toBe(false);
    expect(isRetryableError('Request cancelled by user')).toBe(false);
  });

  it('does not retry auth or rate limit errors', () => {
    expect(isRetryableError('Invalid API key')).toBe(false);
    expect(isRetryableError('401 Unauthorized')).toBe(false);
    expect(isRetryableError('Rate limit exceeded')).toBe(false);
    expect(isRetryableError('429 Too Many Requests')).toBe(false);
  });

  it('retries unknown provider errors by default', () => {
    expect(isRetryableError('Upstream error from Parasail: list index out of range')).toBe(true);
    expect(isRetryableError('Model not found')).toBe(true);
    expect(isRetryableError('Internal server error')).toBe(true);
    expect(isRetryableError('something completely unexpected')).toBe(true);
  });
});
