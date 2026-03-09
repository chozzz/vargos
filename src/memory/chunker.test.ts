import { describe, it, expect } from 'vitest';
import { createChunks, ChunkConfig } from './chunker.js';

const config: ChunkConfig = { chunkSize: 50, chunkOverlap: 10 };

describe('createChunks', () => {
  it('returns a single chunk for short content', () => {
    const chunks = createChunks('test.md', 'hello world', new Date('2025-01-01'), config);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('hello world');
    expect(chunks[0].path).toBe('test.md');
    expect(chunks[0].id).toBe('test.md:1');
    expect(chunks[0].startLine).toBe(1);
  });

  it('splits long content into multiple chunks', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1} with some padding text here`);
    const content = lines.join('\n');
    const chunks = createChunks('big.md', content, new Date(), config);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('preserves line boundaries', () => {
    const content = 'line1\nline2\nline3\nline4\nline5';
    const chunks = createChunks('f.md', content, new Date(), { chunkSize: 500, chunkOverlap: 0 });
    // Small enough for one chunk
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(5);
  });

  it('includes metadata with date and size', () => {
    const date = new Date('2025-06-15');
    const chunks = createChunks('f.md', 'content', date, config);
    expect(chunks[0].metadata.date).toBe('2025-06-15T00:00:00.000Z');
    expect(chunks[0].metadata.size).toBe(7);
  });

  it('handles empty content', () => {
    const chunks = createChunks('empty.md', '', new Date(), config);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('');
  });
});
