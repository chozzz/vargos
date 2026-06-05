import type { MemoryChunk, MemoryStorage } from './types.js';
export declare class MemorySQLiteStorage implements MemoryStorage {
    private readonly dbPath;
    private db;
    constructor(dbPath: string);
    initialize(): Promise<void>;
    saveChunk(chunk: MemoryChunk): Promise<void>;
    getAllChunks(): Promise<MemoryChunk[]>;
    deleteChunksByPath(filePath: string): Promise<void>;
    updateFileStatus(filePath: string, mtime: number, size: number): Promise<void>;
    getFileStatus(filePath: string): Promise<{
        mtime: number;
        size: number;
        indexedAt: number;
    } | null>;
    getStats(): Promise<{
        fileCount: number;
        chunkCount: number;
    }>;
    close(): Promise<void>;
    private rowToChunk;
}
//# sourceMappingURL=sqlite-storage.d.ts.map