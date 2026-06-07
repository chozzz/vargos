import type { MemoryChunk } from './types.js';
export interface ChunkConfig {
    chunkSize: number;
    chunkOverlap: number;
}
export declare function createChunks(relPath: string, content: string, mtime: Date, config: ChunkConfig): MemoryChunk[];
//# sourceMappingURL=chunker.d.ts.map