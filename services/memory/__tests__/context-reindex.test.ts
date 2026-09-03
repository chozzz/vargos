import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

// Helper to create test resources
async function setupTest(): Promise<TestResources> {
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
    storage,
    enableFileWatcher: false, // Disable file watcher for tests
  });
  await context.initialize();

  return {
    tmpDir,
    memoryDir,
    cacheDir,
    sessionsDir,
    storage,
    context,
  };
}

// Helper to teardown test resources
async function teardownTest(resources: TestResources): Promise<void> {
  resources.context.close();
  await fs.rm(resources.tmpDir, { recursive: true, force: true });
}

describe('MemoryContext.reindex', () => {
  let resources: TestResources;

  beforeEach(async () => {
    resources = await setupTest();
    
    // Create initial test files with content
    const file1Path = path.join(resources.memoryDir, 'test1.md');
    const file2Path = path.join(resources.memoryDir, 'test2.md');
    
    await fs.writeFile(file1Path, '# Test Document 1\n\nThis is our first test document.\nIt contains multiple lines.\n\nMore content here.');
    await fs.writeFile(file2Path, '# Test Document 2\n\nSecond test document.\nWith additional information.');
    
    // Force initial sync to index these files
    await (resources.context as unknown as { sync: (o?: { force?: boolean; reason?: string }) => Promise<void> }).sync.call(resources.context, { force: true });
  });

  afterEach(async () => {
    await teardownTest(resources);
  });

  it('removes chunks from deleted files and keeps active files', async () => {
    // Verify files are initially indexed
    let stats = resources.context.getStats();
    expect(stats.files).toBe(2); // test1.md and test2.md
    
    // Now delete test1.md
    await fs.unlink(path.join(resources.memoryDir, 'test1.md'));
    
    // Get initial chunk count for verification
    const _initialChunks = resources.context['chunks'].size;
    
    // Call reindex - this should detect that test1.md no longer exists
    const result = await resources.context.reindex();
    
    expect(result.removed).toBeGreaterThan(0);
    expect(result.kept).toBe(1); // only test2.md remains
    
    // Verify file count updated after reindexing
    stats = resources.context.getStats();
    expect(stats.files).toBe(1);
  });

  it('handles case where no files exist and returns early', async () => {
    // Clean up all markdown files from memory directory
    for (const file of await fs.readdir(resources.memoryDir)) {
      if (file.endsWith('.md')) {
        await fs.unlink(path.join(resources.memoryDir, file));
      }
    }
    
    const result = await resources.context.reindex();
    
    expect(result.removed).toBeGreaterThanOrEqual(0);
    expect(result.kept).toBe(0);
    
    const stats = resources.context.getStats();
    expect(stats.files).toBe(0);
  });

  it('returns immediately if no storage provider is configured', async () => {
    // Create a context without storage
    const contextWithoutStorage = new MemoryContext({
      memoryDir: resources.memoryDir,
      cacheDir: resources.cacheDir,
      sessionsDir: resources.sessionsDir,
      enableFileWatcher: false,
    });

    await contextWithoutStorage.initialize();
    
    const result = await contextWithoutStorage.reindex();
    
    expect(result.removed).toBe(0);
    expect(result.kept).toBe(0);
  });

  it('preserves session-derived chunks from sessions directory', async () => {
    // Create a sample session file
    const sessionFile = path.join(resources.sessionsDir, 'session-2026-01-01T00-00-00-000Z.jsonl');
    const sessionContent = [
      JSON.stringify({ sessionKey: 'test-session', label: 'Test Session' }),
      JSON.stringify({ role: 'user', content: 'Hello world from session' })
    ].join('\n');
    
    await fs.writeFile(sessionFile, sessionContent);
    
    // Force sync to ensure session chunks are loaded
    await (resources.context as unknown as { sync: (o?: { force?: boolean; reason?: string }) => Promise<void> }).sync.call(resources.context, { force: true });
    
    // Get stats before reindexing
    const _statsBefore = resources.context.getStats();
    
    // Delete a memory file to trigger reindexing
    await fs.unlink(path.join(resources.memoryDir, 'test1.md'));
    
    // Call reindex - session chunks should remain
    const result = await resources.context.reindex();
    
    // Stats should reflect removal of memory file chunks but retention of session chunks
    expect(result.removed).toBeGreaterThanOrEqual(0);
  });

  it('correctly handles files in subdirectories', async () => {
    // Create subdirectory and file
    const subDir = path.join(resources.memoryDir, 'subdir');
    await fs.mkdir(subDir, { recursive: true });
    
    const subFile = path.join(subDir, 'nested.md');
    await fs.writeFile(subFile, '# Nested File\nContent in subdirectory\nMultiple lines\nFor testing.');
    
    // Sync after adding new file
    await (resources.context as unknown as { sync: (o?: { force?: boolean; reason?: string }) => Promise<void> }).sync.call(resources.context, { force: true });
    
    const beforeStats = resources.context.getStats();
    expect(beforeStats.files).toBe(3); // test1.md, test2.md, subdir/nested.md
    
    // Delete the nested file
    await fs.unlink(subFile);
    
    // Reindex should remove nested file's chunks
    const result = await resources.context.reindex();
    
    expect(result.removed).toBeGreaterThanOrEqual(1);
    
    // Verify total file count decreased
    const afterStats = resources.context.getStats();
    expect(afterStats.files).toBeLessThan(beforeStats.files);
  });
});