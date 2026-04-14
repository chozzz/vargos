export interface MemoryChunk {
  id:         string;
  path:       string;
  content:    string;
  startLine:  number;
  endLine:    number;
  embedding?: number[];
  metadata: {
    date:  string;
    size:  number;
    [key: string]: unknown;
  };
}

export interface MemoryStorage {
  initialize(): Promise<void>;
  saveChunk(chunk: MemoryChunk): Promise<void>;
  getAllChunks(): Promise<MemoryChunk[]>;
  deleteChunksByPath(filePath: string): Promise<void>;
  updateFileStatus(path: string, mtime: number, size: number): Promise<void>;
  getFileStatus(path: string): Promise<{ mtime: number; size: number; indexedAt: number } | null>;
  close(): Promise<void>;
  searchSimilar?(embedding: number[], limit: number, minScore?: number): Promise<Array<{ chunk: MemoryChunk; score: number }>>;
}
