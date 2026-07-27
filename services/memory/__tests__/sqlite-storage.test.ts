import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { MemorySQLiteStorage } from '../providers/sqlite.js';
import type { MemoryChunk } from '../types.js';

describe('MemorySQLiteStorage', () => {
  let tmpDir: string;
  let dbPath: string;
  let storage: MemorySQLiteStorage;

  beforeEach(async () => {
    tmpDir = path.join(tmpdir(), `sqlite-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tmpDir, { recursive: true });
    dbPath = path.join(tmpDir, 'test.db');
    storage = new MemorySQLiteStorage(dbPath);
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('initializes and creates schema', async () => {
    const stats = await storage.getStats();
    expect(stats).toEqual({ fileCount: 0, chunkCount: 0 });
  });

  it('saves and retrieves chunks', async () => {
    const chunk: MemoryChunk = {
      id: 'test-chunk-1',
      path: 'test/document.md',
      content: 'This is a test chunk content.',
      startLine: 1,
      endLine: 3,
      metadata: { 
        date: new Date().toISOString(),
        size: 30,
        testField: 'test value'
      }
    };

    await storage.saveChunk(chunk);
    
    const chunks = await storage.getAllChunks();
    expect(chunks).toHaveLength(1);
    
    const retrieved = chunks[0];
    expect(retrieved.id).toBe(chunk.id);
    expect(retrieved.path).toBe(chunk.path);
    expect(retrieved.content).toBe(chunk.content);
    expect(retrieved.startLine).toBe(chunk.startLine);
    expect(retrieved.endLine).toBe(chunk.endLine);
    expect(retrieved.metadata).toEqual(chunk.metadata);
  });

  it('handles chunks with embedding vector', async () => {
    const chunk: MemoryChunk = {
      id: 'embed-test',
      path: 'test/embed.md',
      content: 'Chunk with embedding test',
      startLine: 1,
      endLine: 1,
      embedding: [0.1, 0.2, 0.3, 0.4],
      metadata: { 
        date: new Date().toISOString(),
        size: 25 
      }
    };

    await storage.saveChunk(chunk);
    
    const chunks = await storage.getAllChunks();
    expect(chunks).toHaveLength(1);
    
    const retrieved = chunks[0];
    expect(retrieved.embedding).toEqual(chunk.embedding);
  });

  it('manages file tracking correctly', async () => {
    // Update file status
    const testPath = 'test/tracking.md';
    await storage.updateFileStatus(testPath, 1678886400000, 1234);
    
    // Verify status was stored
    const status = await storage.getFileStatus(testPath);
    expect(status).toEqual({
      mtime: 1678886400000,
      size: 1234,
      indexedAt: expect.any(Number)
    });
    
    // Try to get status for non-existent file
    const missingStatus = await storage.getFileStatus('nonexistent.md');
    expect(missingStatus).toBeNull();
  });

  it('deletes chunks by file path', async () => {
    // Create multiple chunks for the same file
    const chunk1: MemoryChunk = {
      id: 'chunk-1',
      path: 'test/file.md',
      content: 'First chunk content',
      startLine: 1,
      endLine: 2,
      metadata: { date: new Date().toISOString(), size: 18 }
    };
    
    const chunk2: MemoryChunk = {
      id: 'chunk-2',
      path: 'test/file.md',
      content: 'Second chunk content',
      startLine: 3,
      endLine: 4,
      metadata: { date: new Date().toISOString(), size: 19 }
    };
    
    const otherChunk: MemoryChunk = {
      id: 'other-chunk',
      path: 'other/file.md',
      content: 'Other file content',
      startLine: 1,
      endLine: 1,
      metadata: { date: new Date().toISOString(), size: 19 }
    };
    
    await storage.saveChunk(chunk1);
    await storage.saveChunk(chunk2);
    await storage.saveChunk(otherChunk);
    
    // Verify all chunks exist before deletion
    let allChunks = await storage.getAllChunks();
    expect(allChunks).toHaveLength(3);
    
    // Delete chunks for test/file.md
    await storage.deleteChunksByPath('test/file.md');
    
    allChunks = await storage.getAllChunks();
    expect(allChunks).toHaveLength(1);
    expect(allChunks[0].id).toBe('other-chunk');
  });

  it('provides list of all tracked paths', async () => {
    // Ensure the path ends with slash to make it consistent with our test setup
    await storage.updateFileStatus('test/file1.md', 1678886400000, 1234);
    await storage.updateFileStatus('another/file2.md', 1678886500000, 5678);
    
    const trackedPaths = await storage.getAllTrackedPaths();
    expect(trackedPaths).toHaveLength(2);
    expect(trackedPaths).toContain('test/file1.md');
    expect(trackedPaths).toContain('another/file2.md');
    
    // Results should be sorted
    expect([...trackedPaths].sort()).toEqual(trackedPaths);
  });

  it('updates stored chunks when saving with same ID', async () => {
    let chunk: MemoryChunk = {
      id: 'update-test',
      path: 'original/path.md',
      content: 'Original content',
      startLine: 1,
      endLine: 1,
      metadata: { date: new Date().toISOString(), size: 16 }
    };

    await storage.saveChunk(chunk);
    
    // Verify initial storage
    let chunks = await storage.getAllChunks();
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('Original content');
    
    // Update the chunk with same ID
    chunk = {
      ...chunk,
      content: 'Updated content',
      path: 'updated/path.md'  // changing path too
    };
    
    await storage.saveChunk(chunk);
    
    // Should only have one chunk with updated content
    chunks = await storage.getAllChunks();
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('Updated content');
    expect(chunks[0].path).toBe('updated/path.md');
  });

  it('tracks stats correctly after various operations', async () => {
    // Initially empty
    let stats = await storage.getStats();
    expect(stats).toEqual({ fileCount: 0, chunkCount: 0 });
    
    // Add a file status and a chunk
    await storage.updateFileStatus('some/file.md', 1678886400000, 1234);
    
    const chunk: MemoryChunk = {
      id: 'stats-test',
      path: 'some/file.md',
      content: 'Testing stats aggregation',
      startLine: 1,
      endLine: 1,
      metadata: { date: new Date().toISOString(), size: 25 }
    };
    
    await storage.saveChunk(chunk);
    
    // Should reflect single file and single chunk
    stats = await storage.getStats();
    expect(stats).toEqual({ fileCount: 1, chunkCount: 1 });
    
    // Add more chunks to same file
    const chunk2 = { ...chunk, id: 'stats-test-2', content: 'More content' };
    await storage.saveChunk(chunk2);
    
    // File count should stay same, but chunk count increases
    stats = await storage.getStats();
    expect(stats).toEqual({ fileCount: 1, chunkCount: 2 });
  });
});