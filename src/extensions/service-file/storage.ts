import type { MemoryChunk } from './memory-context.js';

export interface MemoryStorage {
  initialize(): Promise<void>;
  saveChunk(chunk: MemoryChunk): Promise<void>;
  getChunksByPath(filePath: string): Promise<MemoryChunk[]>;
  getAllChunks(): Promise<MemoryChunk[]>;
  deleteChunksByPath(filePath: string): Promise<void>;
  updateFileStatus(path: string, mtime: number, size: number): Promise<void>;
  getFileStatus(path: string): Promise<{ mtime: number; size: number; indexedAt: number } | null>;
  getStats(): Promise<{ fileCount: number; chunkCount: number }>;
  close(): Promise<void>;
  searchSimilar?(embedding: number[], limit: number, minScore?: number): Promise<Array<{ chunk: MemoryChunk; score: number }>>;
}
