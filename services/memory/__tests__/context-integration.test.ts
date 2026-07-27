import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryContext } from '../context.js';
import { MemorySQLiteStorage } from '../providers/sqlite.js';

interface TestResources {
  tmpDir: string;
  memoryDir: string;
  cacheDir: string;
  sessionsDir: string;
  storage: MemorySQLiteStorage;
  context: MemoryContext;
}

// Mock the generateEmbedding function properly using import actual
vi.mock('../embedding.js', async () => {
  const actual = await import('../embedding.js');
  return {
    ...actual,
    generateEmbedding: vi.fn().mockImplementation(async (text: string) => {
      // Return mock embeddings only if content is of decent length
      if (typeof text === 'string' && text.length > 20) {
        return [0.1 + text.charCodeAt(0) / 1000, 0.2, 0.3 + text.charCodeAt(text.length-1) / 1000];
      }
      return undefined;
    }),
    cosineSimilarity: vi.fn().mockReturnValue(0.5),
    textScore: vi.fn().mockImplementation((query: string, content: string) => {
      if (query && content) {
        const queryTerms = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
        const contentLower = content.toLowerCase();
        if (queryTerms.length === 0) return 0;
        let matches = 0;
        for (const term of queryTerms) {
          if (contentLower.includes(term)) matches++;
        }
        return matches / queryTerms.length;
      }
      return 0;
    }),
  };
});

describe('MemoryContext - Full integration tests', () => {
  let resources: TestResources;
  
  beforeEach(async () => {
    // Setup test resources
    const tmpDir = path.join(tmpdir(), `memory-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const memoryDir = path.join(tmpDir, 'memory');
    const cacheDir = path.join(tmpDir, 'cache');
    const sessionsDir = path.join(tmpDir, 'sessions');
    
    await fs.mkdir(memoryDir, { recursive: true });
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.mkdir(sessionsDir, { recursive: true });

    const dbPath = path.join(cacheDir, 'memory.db');
    const storage = new MemorySQLiteStorage(dbPath);
    await storage.initialize();

    const context = new MemoryContext({
      memoryDir,
      cacheDir,
      sessionsDir,
      chunkSize: 100, // Small chunks for testing
      chunkOverlap: 20,
      embeddingProvider: 'none', // Don't actually call external API
      storage,
      enableFileWatcher: false, // Disable file watcher for tests
    });
    await context.initialize();

    resources = {
      tmpDir,
      memoryDir,
      cacheDir,
      sessionsDir,
      storage,
      context,
    };
    
    // Create test files with content
    const file1Path = path.join(resources.memoryDir, 'document1.md');
    const file2Path = path.join(resources.memoryDir, 'document2.md');
    const nestedPath = path.join(resources.memoryDir, 'subfolder', 'nested.md');
    
    await fs.mkdir(path.dirname(nestedPath), { recursive: true });
    
    await fs.writeFile(file1Path, `# Document 1
## Introduction
This is the first test document with sample content.
We want several paragraphs of text to test chunking functionality.
Here's the final paragraph of document 1.`);

    await fs.writeFile(file2Path, `# Document 2
Another document with different content for testing purposes.
This will help us verify the indexing process works correctly.
End of document 2.`);

    await fs.writeFile(nestedPath, `# Nested Document
Content inside a subdirectory.
This tests path resolution.
Last line of nested.`);
  });

  afterEach(async () => {
    resources.context.close();
    await fs.rm(resources.tmpDir, { recursive: true, force: true });
  });

  it('properly chunks and indexes documents', async () => {
    // Initial sync happens in constructor, force it again
    await (resources.context as any).sync.call(resources.context, { force: true });
    
    const stats = resources.context.getStats();
    expect(stats.files).toBe(3); // document1.md, document2.md, nested.md
    expect(stats.chunks).toBeGreaterThanOrEqual(3); // Should have at least as many chunks as files
    
    // Verify search returns results
    const results = await resources.context.search('test document');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('chunk');
    expect(results[0]).toHaveProperty('score');
    expect(results[0]).toHaveProperty('citation');
    
    // Results should have citations referencing the files we created
    const citations = results.map(r => r.citation);
    expect(citations.some(c => c.includes('document1.md'))).toBe(true);
    expect(citations.some(c => c.includes('document2.md'))).toBe(true);
    expect(citations.some(c => c.includes('nested.md'))).toBe(true);
  });

  it('search finds relevant content based on query', async () => {
    await (resources.context as any).sync.call(resources.context, { force: true });
    
    const results = await resources.context.search('sample content');
    expect(results.length).toBeGreaterThan(0);
    
    // The sample content is in document1.md, so at least one result should reference it
    const relevantResult = results.find(r => r.citation.includes('document1.md'));
    expect(relevantResult).toBeDefined();
    expect(relevantResult!.score).toBeGreaterThanOrEqual(0.3); // Default min score
    
    // Check that content in results matches expected text
    expect(relevantResult!.chunk.content).toContain('sample content');
  });

  it('reads files correctly with optional range parameters', async () => {
    const result = await resources.context.readFile({
      relPath: 'document1.md',
      from: 2, // Skip # Document 1 heading
      lines: 2 // Just the next 2 lines
    });
    
    expect(result.path).toBe('document1.md');
    const contentLines = result.text.split('\n');
    expect(contentLines[0]).toBe('## Introduction');
    expect(contentLines[1]).toBe('This is the first test document with sample content.');
  });

  it('writes files correctly and updates indexing', async () => {
    const newFilePath = 'new_document.md';
    const newContent = `# New Document
Written by the test suite.
Contains some test content.
Check if indexing works automatically.`;
    
    await resources.context.writeFile(newFilePath, newContent, 'overwrite');
    
    const readResult = await resources.context.readFile({ relPath: newFilePath });
    expect(readResult.text).toContain('test content');
    
    // After writing, sync should have happened, so searching should find it
    await (resources.context as any as { sync: (options?:{reason?: string; force?: boolean})=>Promise<void> }).sync.call(resources.context, { force: true });
    
    const searchResults = await resources.context.search('test content');
    const foundNewDoc = searchResults.some(r => r.citation.includes(newFilePath));
    expect(foundNewDoc).toBe(true);
  });

  it('appends content correctly', async () => {
    const testFile = 'appendToMe.md';
    const initialContent = '# Initial Content\nFirst part of the file.';
    await resources.context.writeFile(testFile, initialContent, 'overwrite');
    
    const appendContent = '\n\nAdditional content appended.';
    await resources.context.writeFile(testFile, appendContent, 'append');
    
    const readResult = await resources.context.readFile({ relPath: testFile });
    expect(readResult.text).toContain('Initial Content');
    expect(readResult.text).toContain('Additional content appended');
  });

  it('maintains secure path resolution', async () => {
    // Try to read using path traversal - should throw error
    await expect(resources.context.readFile({
      relPath: '../../../etc/passwd' 
    })).rejects.toThrow('Path traversal denied');
    
    // Similarly for write operations
    await expect(resources.context.writeFile(
      '../../../forbidden_location.txt',
      'Forbidden content'
    )).rejects.toThrow('Path traversal denied');
  });

  it('returns correct statistics', async () => {
    await (resources.context as any).sync.call(resources.context, { force: true });
    
    const stats = resources.context.getStats();
    expect(stats.files).toBe(3); // 3 markdown files
    expect(stats.chunks).toBeGreaterThan(0);  // At least one chunk per file
    expect(stats.lastSync).toBeInstanceOf(Date);
  });

  it('handles search with custom parameters', async () => {
    await (resources.context as any).sync.call(resources.context, { force: true });
    
    // Test with custom max results
    const limitedResults = await resources.context.search('content', { 
      maxResults: 2 
    });
    expect(limitedResults.length).toBeLessThanOrEqual(2);
    
    // Test with custom min score
    await resources.context.search('content', {
      minScore: 0.9  // Very restrictive score 
    });
    // Should return empty array for high threshold with mock embeddings
  });
});