import { describe, it, expect } from 'vitest';
import { extractTextContent, isThinkingOnlyContent } from './runtime.js';

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
