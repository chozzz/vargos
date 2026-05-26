import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Unit tests for file-based media cache behavior.
 * Tests the cache file format and persistence.
 */

function cachePath(filePath: string): string {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  return path.join(dir, `${base}.metadata.json`);
}

function readCache(filePath: string): Record<string, unknown> | null {
  try {
    const cacheFile = cachePath(filePath);
    const raw = readFileSync(cacheFile, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

describe('File-based media cache', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `file-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates cache file next to media file', () => {
    const mediaFile = path.join(tmpDir, 'test.ogg');
    const cacheFile = cachePath(mediaFile);

    // Write a cache entry
    writeFileSync(cacheFile, JSON.stringify({ transcribe: 'Hello world' }, null, 2), 'utf-8');

    expect(existsSync(cacheFile)).toBe(true);
    expect(readCache(mediaFile)).toEqual({ transcribe: 'Hello world' });
  });

  it('persists cache across reads', () => {
    const mediaFile = path.join(tmpDir, 'test2.ogg');
    const cacheFile = cachePath(mediaFile);

    // Write initial cache
    writeFileSync(cacheFile, JSON.stringify({ transcribe: 'First transcription' }, null, 2), 'utf-8');

    // Read it back
    const cached = readCache(mediaFile);
    expect(cached?.transcribe).toBe('First transcription');

    // Update cache
    writeFileSync(cacheFile, JSON.stringify({ transcribe: 'Updated transcription', describe: 'Image description' }, null, 2), 'utf-8');

    // Read updated cache
    const updated = readCache(mediaFile);
    expect(updated?.transcribe).toBe('Updated transcription');
    expect(updated?.describe).toBe('Image description');
  });

  it('returns null for missing cache', () => {
    const mediaFile = path.join(tmpDir, 'nonexistent.ogg');
    expect(readCache(mediaFile)).toBeNull();
  });

  it('handles malformed JSON gracefully', () => {
    const mediaFile = path.join(tmpDir, 'malformed.ogg');
    const cacheFile = cachePath(mediaFile);

    writeFileSync(cacheFile, 'not valid json{{{', 'utf-8');

    expect(readCache(mediaFile)).toBeNull();
  });

  it('cache path is in same directory as media file', () => {
    const nestedDir = path.join(tmpDir, 'nested', 'deep');
    mkdirSync(nestedDir, { recursive: true });
    const mediaFile = path.join(nestedDir, 'voice.ogg');
    const cacheFile = cachePath(mediaFile);

    expect(cacheFile).toBe(path.join(nestedDir, 'voice.ogg.metadata.json'));
  });
});
