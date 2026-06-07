import type { MemoryChunk } from './types.js';
type EmbedFn = (text: string) => Promise<number[] | undefined>;
export declare function indexSessions(sessionsDir: string, embed: EmbedFn): Promise<MemoryChunk[]>;
export {};
//# sourceMappingURL=session-indexer.d.ts.map