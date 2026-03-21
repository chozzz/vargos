/**
 * Memory service types
 */

export interface SearchResult {
  content: string;
  score: number;
  metadata: {
    path: string;
    from: number;
    to: number;
    date?: string;
    [key: string]: unknown;
  };
}

export interface SearchOptions {
  limit?: number;
  minScore?: number;
  filters?: {
    dateFrom?: Date;
    dateTo?: Date;
    paths?: string[];
  };
}

export interface MemoryEntry {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryWriteOptions {
  metadata?: Record<string, unknown>;
  mode?: 'append' | 'overwrite';
}

export interface IMemoryService {
  readonly name: string;

  write(path: string, content: string, options?: MemoryWriteOptions): Promise<void>;
  read(path: string, options?: { offset?: number; limit?: number }): Promise<string>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  list(directory: string): Promise<string[]>;

  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  initialize(): Promise<void>;
  close(): Promise<void>;
}

export interface MemoryChunk {
  id: string;
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  embedding?: number[];
  metadata: {
    date: string;
    size: number;
    [key: string]: unknown;
  };
}

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
