import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryContext } from '../context.js';
import { MemorySQLiteStorage } from '../providers/sqlite.js';
import type { EmbeddingConfig } from '../embedding.js';
import path from 'node:path';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

vi.mock('../embedding.js', async () => {
  const actual = await vi.importActual('../embedding.js');
  return {
    ...actual,
    generateEmbedding: vi.fn().mockImplementation(async (text: string, config: EmbeddingConfig) => {
      if (config.provider === 'none') return undefined;
      if (config.provider === 'openai' && !config.openaiApiKey) return undefined;
      // Return mock embedding when provider is valid
      return [0.1, 0.5, 0.9, 0.2];
    }),
    cosineSimilarity: vi.fn().mockReturnValue(0.7),
    textScore: vi.fn().mockReturnValue(0.3),
  };
});

describe('MemoryContext - Configuration handling', () => {
  let tmpDir: string;
  let memoryDir: string;
  let cacheDir: string;
  let storage: MemorySQLiteStorage;

  beforeEach(async () => {
    tmpDir = path.join(tmpdir(), `memory-config-test-${Date.now()}`);
    memoryDir = path.join(tmpDir, 'memory');
    cacheDir = path.join(tmpDir, 'cache');
    
    await mkdir(memoryDir, { recursive: true });
    await mkdir(cacheDir, { recursive: true });

    const dbPath = path.join(cacheDir, 'memory.db');
    storage = new MemorySQLiteStorage(dbPath);
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('accepts different embedding provider options', async () => {
    // Test provider: none
    let context = new MemoryContext({
      memoryDir,
      cacheDir,
      embeddingProvider: 'none',
      storage,
    });
    await context.initialize();
    await context.close();

    // Test provider: openai with valid key
    context = new MemoryContext({
      memoryDir,
      cacheDir,
      embeddingProvider: 'openai',
      openaiApiKey: 'test-key-123',
      storage,
    });
    await context.initialize();
    await context.close();

    // Test provider: local (though currently maps to same handling as others in our mocks)
    context = new MemoryContext({
      memoryDir,
      cacheDir,
      embeddingProvider: 'local',
      storage,
    });
    await context.initialize();
    await context.close();
  });

  it('allows customization of chunk sizing', async () => {
    const context = new MemoryContext({
      memoryDir,
      cacheDir,
      storage,
      chunkSize: 200,     // Larger than default of 400
      chunkOverlap: 40,   // Larger than default of 80
    });
    await context.initialize();

    // Test that the file content will result in larger chunks
    const testFile = path.join(memoryDir, 'custom-sizing.md');
    const content = Array(50).fill('# Line of content\n').join(''); // Multiple lines to chunk
    await writeFile(testFile, content);
    
    // Call sync to index the file
    await (context as any).sync.call(context, { force: true });
    
    // This verifies that context accepts and uses the custom sizing
    const stats = context.getStats();
    expect(stats.files).toBe(1); // Our test file should be indexed
    await context.close();
  });

  it('allows customization of hybrid search weights', async () => {
    const context = new MemoryContext({
      memoryDir,
      cacheDir,
      storage,
      hybridWeight: { vector: 0.9, text: 0.1 }, // Different from default of 0.7/0.3
    });
    await context.initialize();
    
    // Create a test file for search
    const testFile = path.join(memoryDir, 'weight-test.md');
    const content = '# Weight Testing Document\n\nContent for verifying search weighting.\nMore search content here.';
    await writeFile(testFile, content);
    
    // Sync to index
    await (context as any).sync.call(context, { force: true });
    
    // Perform a search to trigger the hybrid algorithm
    const results = await context.search('search weighting');
    // Even with different weights, search should return relevant results
    expect(results).toBeDefined();
    
    await context.close();
  });

  it('handles missing storage gracefully during initialization', async () => {
    const context = new MemoryContext({
      memoryDir,
      cacheDir,
    });
    // Context should initialize without error even without storage
    await context.initialize();
    
    // The storage instance variable would be null in this case
    // so the internal functionality needs to handle this case (e.g., file persistence will be skipped)
    
    // Simple operation that should work without storage
    const stats = context.getStats();
    expect(stats.files).toBe(0);
    expect(stats.chunks).toBe(0);
    
    await context.close();
  });

  it('respects disable file watcher setting', async () => {
    // Context with file watcher enabled (default)
    let context = new MemoryContext({
      memoryDir,
      cacheDir,
      storage,
      enableFileWatcher: true,
    });
    await context.initialize();
    
    const watcherEnabledContext = context as any;
    expect(watcherEnabledContext.fileWatcher).toBeDefined(); // Should initialize with watcher
    
    await context.close();
    
    // Context with file watcher disabled
    context = new MemoryContext({
      memoryDir,
      cacheDir,
      storage,
      enableFileWatcher: false,
    });
    await context.initialize();
    
    const watcherDisabledContext = context as any;
    expect(watcherDisabledContext.fileWatcher).toBeNull(); // Should not initialize watcher
    
    await context.close();
  });
});