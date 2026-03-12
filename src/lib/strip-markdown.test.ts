import { describe, it, expect } from 'vitest';
import { stripMarkdown } from './strip-markdown.js';

describe('stripMarkdown', () => {
  it('removes headers', () => {
    expect(stripMarkdown('## Hello\n### World')).toBe('Hello\nWorld');
  });

  it('removes bold and italic', () => {
    expect(stripMarkdown('**bold** and *italic*')).toBe('bold and italic');
    expect(stripMarkdown('__bold__ and _italic_')).toBe('bold and italic');
  });

  it('removes inline code', () => {
    expect(stripMarkdown('run `npm install` now')).toBe('run npm install now');
  });

  it('removes code blocks', () => {
    expect(stripMarkdown('```js\nconst x = 1;\n```')).toBe('const x = 1;');
  });

  it('converts links', () => {
    expect(stripMarkdown('[click here](https://example.com)')).toBe('click here (https://example.com)');
  });

  it('converts list markers to bullets', () => {
    expect(stripMarkdown('- one\n- two')).toBe('• one\n• two');
  });

  it('removes blockquotes', () => {
    expect(stripMarkdown('> quoted text')).toBe('quoted text');
  });

  it('collapses excessive newlines', () => {
    expect(stripMarkdown('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('leaves plain text unchanged', () => {
    const plain = 'Just a normal message with no formatting.';
    expect(stripMarkdown(plain)).toBe(plain);
  });
});
