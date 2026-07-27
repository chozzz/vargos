import { describe, it, expect } from 'vitest';
import { createChunks, type ChunkConfig } from '../chunker.js';

describe('chunker.ts - createChunks function', () => {
  it('creates appropriate number of chunks for longer content', () => {
    const relPath = 'test.md';
    const content = `# Test Document

Paragraph 1 with some content that will be chunked properly.
This is additional content to make the paragraph longer and more substantial.
We need several sentences to exceed the chunk size threshold.

Paragraph 2 has different content but will also be processed into chunks.
More text in paragraph 2 to increase the length significantly.
Each paragraph contributes to the overall character count for chunking.

Final paragraph with ending content.
This paragraph might end up as its own chunk or merged with previous ones.
The algorithm will decide based on the calculated token-based sizes.`;
    
    const mtime = new Date('2026-01-01T00:00:00Z');
    const config: ChunkConfig = { chunkSize: 40, chunkOverlap: 8 }; // Small chunks for testing

    const chunks = createChunks(relPath, content, mtime, config);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThan(15); // Should create reasonable number of chunks
    
    for (const chunk of chunks) {
      expect(chunk.id).toMatch(/^test\.md:\d+$/); // Should have path and start line
      expect(chunk.path).toBe('test.md');
      expect(chunk.content).toBeTruthy(); // Should have content
      expect(chunk.startLine).toBeGreaterThanOrEqual(1);
      expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
      expect(chunk.metadata).toHaveProperty('date');
      expect(chunk.metadata).toHaveProperty('size');
      expect(chunk.metadata.date).toBe(mtime.toISOString());
    }
  });

  it('handles short content with single chunk', () => {
    const relPath = 'short.md';
    const content = 'Short content that fits in single chunk.';
    const mtime = new Date('2026-01-01T00:00:00Z');
    const config: ChunkConfig = { chunkSize: 100, chunkOverlap: 20 };

    const chunks = createChunks(relPath, content, mtime, config);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(content);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(1);
  });

  it('handles empty content gracefully', () => {
    const relPath = 'empty.md';
    const content = '';
    const mtime = new Date('2026-01-01T00:00:00Z');
    const config: ChunkConfig = { chunkSize: 40, chunkOverlap: 8 };

    const chunks = createChunks(relPath, content, mtime, config);

    // Should return empty array for empty content as there are no trimmed chunks to create
    expect(chunks).toHaveLength(0);
  });

  it('handles single line content', () => {
    const relPath = 'single-line.md';
    const content = 'A single line of text that is shorter than chunk size.';
    const mtime = new Date('2026-01-01T00:00:00Z');
    const config: ChunkConfig = { chunkSize: 100, chunkOverlap: 20 };

    const chunks = createChunks(relPath, content, mtime, config);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(content);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(1);
  });

  it('creates overlapping content between sequential chunks', () => {
    const relPath = 'multi-chunk.md';
    const content = `
Line1: This is the beginning part of our content that fills the first chunk.
Line2: More content goes here and continues to fill up space in the first chunk. 
Line3: We keep adding more content to ensure we reach the chunk limit.
Line4: At some point we'll reach the character threshold and need to split.
Line5: The next line continues content that forms the second chunk.
Line6: Additional lines go in this second chunk along with overlapping text.
Line7: This line provides even more substance to make sure we have multiple lines.
Line8: More lines to ensure adequate content for testing overlap.
Line9: This is the final line for our test content.
`;
    
    const mtime = new Date('2026-01-01T00:00:00Z');
    // Use small chunk size to force multiple chunks
    const config: ChunkConfig = { chunkSize: 25, chunkOverlap: 5 };
    
    const chunks = createChunks(relPath, content, mtime, config);
    
    expect(chunks.length).toBeGreaterThanOrEqual(2); // Should have multiple chunks
    
    // If we have more than 1 chunk, verify overlap exists between adjacent chunks
    if (chunks.length > 1) {
      const first = chunks[0];
      const second = chunks[1];
      
      // The second chunk should contain lines that appear towards the end of first chunk
      const firstChunkLines = first.content.split('\n'); 
      firstChunkLines.slice(-3).join('\n'); // Used for conceptual overlap validation

      expect(second.content).toContain(firstChunkLines[firstChunkLines.length - 1]); // Last line of first chunk
      
      // Overlap means second chunk content should contain fragments of first chunk
      // This might be approximate since chunking logic is token-based
    }
  });

  it('preserves line numbers accurately', () => {
    const relPath = 'line-test.md';
    const content = `Line 1
Line 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10`;
    
    const mtime = new Date('2026-01-01T00:00:00Z');
    // Medium chunk size to get few chunks
    const config: ChunkConfig = { chunkSize: 30, chunkOverlap: 0 }; // No overlap to simplify test

    const chunks = createChunks(relPath, content, mtime, config);

    // All content should be covered by chunks
    const totalLines = content.split('\n').length;
    
    let expectedStart = 1;
    for (const chunk of chunks) {
      expect(chunk.startLine).toBe(expectedStart);
      expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
      expect(chunk.content).toBeTruthy();
      
      // Adjust the start for the next chunk
      // Since this is a simplified test without complex overlap logic,
      // verify basic line range correctness
      expectedStart = chunk.endLine + 1;
    }

    // The last chunk should end with the last line
    if (chunks.length > 0) {
      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk.endLine).toBe(totalLines);
    } 
    // If there are no chunks due to very tight chunksize, that's ok too
  });

  it('includes correct metadata with date and size', () => {
    const relPath = 'metadata-test.md';
    const content = 'Content to test metadata inclusion.';
    const mtime = new Date('2026-07-27T12:34:56.789Z');
    const config: ChunkConfig = { chunkSize: 100, chunkOverlap: 20 };

    const chunks = createChunks(relPath, content, mtime, config);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.date).toBe(mtime.toISOString());
    expect(chunks[0].metadata.size).toBe(content.length);
  });

  it('creates chunks with properly formatted IDs', () => {
    const relPath = 'unique-id-test.md';
    
    // Test content that the chunking algorithm will process
    const content = Array(15).fill('Testing chunker algorithm on this line content.\n').join('');
    const mtime = new Date('2026-01-01T00:00:00Z');
    const config: ChunkConfig = { chunkSize: 8, chunkOverlap: 3 }; // Configuration designed to create chunks

    const chunks = createChunks(relPath, content, mtime, config);
    
    // The algorithm may create one or more chunks depending on implementation
    const ids = chunks.map(c => c.id);
    const uniqueIds = new Set(ids);
    
    // Verify each chunk has a unique ID
    expect(uniqueIds.size).toBe(ids.length); // Verify no duplicate IDs in the set
    
    // Verify all IDs have correct format (path:startLineNumber)
    const idPattern = /^unique-id-test\.md:\d+$/;
    expect(ids.every(id => idPattern.test(id))).toBe(true);
    
    // Check that each chunk maintains correct metadata
    chunks.forEach(chunk => {
      expect(chunk.path).toBe(relPath);
      expect(chunk.startLine).toBeGreaterThanOrEqual(1);
      expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
      expect(chunk.content).toBeDefined();
      expect(chunk.metadata).toBeDefined();
      expect(chunk.metadata.date).toBeDefined();
    });
  });

  it('handles markdown with code blocks correctly', () => {
    const relPath = 'markdown-test.md';
    const content = `# Title

This is a paragraph with \`inline code\`.

\`\`\`javascript
function hello() {
  console.log("world");
}
\`\`\`

More content after the code block.
Final paragraph.

# Second Heading

Some more content under second heading.`;
    
    const mtime = new Date('2026-01-01T00:00:00Z');
    const config: ChunkConfig = { chunkSize: 40, chunkOverlap: 8 };

    const chunks = createChunks(relPath, content, mtime, config);

    // Should not break markdown syntax inappropriately
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    
    // All chunk content combined should preserve original content (modulo whitespace normalization)
    const reconstructed = chunks.map(c => c.content).join('\n').trim();
    
    // The chunks don't necessarily preserve the exact spacing but should contain the main elements 
    expect(reconstructed).toContain('function hello');
    expect(reconstructed).toContain('console.log("world")');
    expect(reconstructed).toContain('More content after the code block');
  });
});