import type { MemoryStorage, MemoryChunk } from './types.js';
export type { MemoryChunk };
export interface ContextSearchResult {
    chunk: MemoryChunk;
    score: number;
    citation: string;
}
export interface MemoryContextConfig {
    memoryDir: string;
    cacheDir: string;
    sessionsDir?: string;
    chunkSize?: number;
    chunkOverlap?: number;
    embeddingProvider?: 'openai' | 'local' | 'none';
    openaiApiKey?: string;
    embeddingModel?: string;
    hybridWeight?: {
        vector: number;
        text: number;
    };
    storage?: MemoryStorage;
    enableFileWatcher?: boolean;
}
export declare class MemoryContext {
    private readonly config;
    private readonly chunkSize;
    private readonly chunkOverlap;
    private readonly embeddingProvider;
    private readonly hybridWeight;
    private readonly enableFileWatcher;
    private readonly embeddingConfig;
    private chunks;
    private lastSync;
    private storage;
    private fileWatcher;
    private watcherDebounce;
    constructor(config: MemoryContextConfig);
    initialize(): Promise<void>;
    close(): Promise<void>;
    sync(options?: {
        reason?: string;
        force?: boolean;
    }): Promise<void>;
    private checkNeedsReindex;
    private indexFile;
    private removeFileChunks;
    search(query: string, options?: {
        maxResults?: number;
        minScore?: number;
    }): Promise<ContextSearchResult[]>;
    readFile(params: {
        relPath: string;
        from?: number;
        lines?: number;
    }): Promise<{
        path: string;
        text: string;
    }>;
    writeFile(relPath: string, content: string, mode?: 'overwrite' | 'append'): Promise<void>;
    getStats(): {
        files: number;
        chunks: number;
        lastSync: Date | null;
    };
    private startFileWatcher;
    private stopFileWatcher;
}
//# sourceMappingURL=context.d.ts.map