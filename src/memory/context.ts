import { promises as fs } from 'node:fs';
import path from 'node:path';
import { glob } from 'tinyglobby';
import { fileURLToPath } from 'node:url';
import type { MemoryStorage, MemoryChunk } from './types.js';
import { FSWatcher, watch } from 'node:fs';
import { createLogger } from '../lib/logger.js';
import { generateEmbedding, cosineSimilarity, textScore } from './embedding.js';
import { createChunks } from './chunker.js';
import { indexSessions } from './session-indexer.js';
export type { MemoryChunk } from './types.js';

const log = createLogger('memory');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ContextSearchResult {
  chunk: MemoryChunk;
  score: number;
  citation: string;
}

export interface MemoryContextConfig {
  memoryDir: string;
  cacheDir: string;
  chunkSize?: number;
  chunkOverlap?: number;
  embeddingProvider?: 'openai' | 'local' | 'none';
  openaiApiKey?: string;
  hybridWeight?: {
    vector: number;
    text: number;
  };
  storage?: MemoryStorage;
  sessionsDir?: string;
  enableFileWatcher?: boolean;
}

type ResolvedMemoryContextConfig = MemoryContextConfig & {
  chunkSize: number;
  chunkOverlap: number;
  cacheDir: string;
  embeddingProvider: 'openai' | 'local' | 'none';
  hybridWeight: { vector: number; text: number };
  enableFileWatcher: boolean;
};

export class MemoryContext {
  private config: ResolvedMemoryContextConfig;
  private chunks: Map<string, MemoryChunk> = new Map();
  private lastSync: number = 0;
  private storage: MemoryStorage | null = null;
  private fileWatcher: FSWatcher | null = null;
  private watcherDebounce: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: MemoryContextConfig) {
    this.config = {
      chunkSize: 400,
      chunkOverlap: 80,
      embeddingProvider: 'none',
      hybridWeight: { vector: 0.7, text: 0.3 },
      enableFileWatcher: config.enableFileWatcher ?? false,
      ...config,
    } as ResolvedMemoryContextConfig;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.config.cacheDir, { recursive: true });

    if (this.config.storage) {
      this.storage = this.config.storage;
      await this.storage.initialize();

      const cachedChunks = await this.storage.getAllChunks();
      for (const chunk of cachedChunks) {
        this.chunks.set(chunk.id, chunk);
      }
    }

    await this.sync({ reason: 'initialization' });

    if (this.config.enableFileWatcher) {
      this.startFileWatcher();
    }
  }

  async close(): Promise<void> {
    this.stopFileWatcher();
    await this.storage?.close();
    this.storage = null;
  }

  // ========================================================================
  // File Watcher
  // ========================================================================

  private startFileWatcher(): void {
    if (this.fileWatcher) return;

    try {
      this.fileWatcher = watch(this.config.memoryDir, { recursive: true }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.md')) return;

        const fullPath = path.join(this.config.memoryDir, filename);

        const existing = this.watcherDebounce.get(fullPath);
        if (existing) clearTimeout(existing);

        const timeout = setTimeout(async () => {
          this.watcherDebounce.delete(fullPath);
          log.debug(`File changed: ${filename}`);
          await this.indexFile(filename, { force: true });
        }, 500);

        this.watcherDebounce.set(fullPath, timeout);
      });
    } catch (err) {
      log.error('Failed to start file watcher:', err);
    }
  }

  private stopFileWatcher(): void {
    for (const timeout of this.watcherDebounce.values()) {
      clearTimeout(timeout);
    }
    this.watcherDebounce.clear();

    this.fileWatcher?.close();
    this.fileWatcher = null;
  }

  // ========================================================================
  // Indexing / Sync
  // ========================================================================

  async sync(options?: {
    reason?: string;
    force?: boolean;
    progress?: (msg: string) => void;
  }): Promise<void> {
    const now = Date.now();

    if (!options?.force && now - this.lastSync < 5000) return;

    options?.progress?.(`Syncing memory from ${this.config.memoryDir}...`);

    const files = await glob('**/*.md', {
      cwd: this.config.memoryDir,
      absolute: true,
    });

    let indexed = 0;
    for (const file of files) {
      const relativePath = path.relative(this.config.memoryDir, file);
      const needsReindex = await this.checkNeedsReindex(relativePath, file);
      if (options?.force || needsReindex) {
        await this.indexFile(relativePath, options);
        indexed++;
      }
    }

    if (this.config.sessionsDir) {
      const embed = (text: string) => generateEmbedding(text, {
        provider: this.config.embeddingProvider,
        openaiApiKey: this.config.openaiApiKey,
      });

      const sessionChunks = await indexSessions(this.config.sessionsDir, embed);
      for (const chunk of sessionChunks) {
        this.chunks.set(chunk.id, chunk);
        await this.storage?.saveChunk(chunk);
      }

      options?.progress?.(`Indexed ${sessionChunks.length} session chunks`);
    }

    this.lastSync = now;
    options?.progress?.(`Indexed ${indexed} files, ${this.chunks.size} chunks`);
  }

  private async checkNeedsReindex(relPath: string, fullPath: string): Promise<boolean> {
    if (!this.storage) return true;

    const stat = await fs.stat(fullPath).catch(() => null);
    if (!stat) return true;

    const status = await this.storage.getFileStatus(relPath);
    if (!status) return true;

    return status.mtime !== stat.mtime.getTime() || status.size !== stat.size;
  }

  private async indexFile(relPath: string, options?: { force?: boolean; progress?: (msg: string) => void }): Promise<void> {
    const fullPath = path.join(this.config.memoryDir, relPath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const stat = await fs.stat(fullPath);

      this.removeFileChunks(relPath);
      await this.storage?.deleteChunksByPath(relPath);

      const chunks = createChunks(relPath, content, stat.mtime, {
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
      });

      if (this.config.embeddingProvider !== 'none') {
        for (const chunk of chunks) {
          chunk.embedding = await generateEmbedding(chunk.content, {
            provider: this.config.embeddingProvider,
            openaiApiKey: this.config.openaiApiKey,
          });
        }
      }

      for (const chunk of chunks) {
        this.chunks.set(chunk.id, chunk);
        await this.storage?.saveChunk(chunk);
      }

      await this.storage?.updateFileStatus(relPath, stat.mtime.getTime(), stat.size);

      options?.progress?.(`Indexed ${relPath}: ${chunks.length} chunks`);
    } catch (err) {
      log.error(`Failed to index ${relPath}:`, err);
    }
  }

  private removeFileChunks(relPath: string): void {
    for (const [id, chunk] of this.chunks) {
      if (chunk.path === relPath) {
        this.chunks.delete(id);
      }
    }
  }

  // ========================================================================
  // Search
  // ========================================================================

  async search(
    query: string,
    options: {
      maxResults?: number;
      minScore?: number;
    } = {},
  ): Promise<ContextSearchResult[]> {
    await this.sync();

    const maxResults = options.maxResults ?? 6;
    const minScore = options.minScore ?? 0.3;

    const embeddingConfig = {
      provider: this.config.embeddingProvider,
      openaiApiKey: this.config.openaiApiKey,
    };
    const queryEmbedding = await generateEmbedding(query, embeddingConfig);

    const vectorResults: Map<string, number> = new Map();
    if (queryEmbedding && this.storage?.searchSimilar) {
      const hits = await this.storage.searchSimilar(queryEmbedding, maxResults * 2, minScore);
      for (const { chunk, score } of hits) {
        vectorResults.set(chunk.id, score * this.config.hybridWeight.vector);
        if (!this.chunks.has(chunk.id)) this.chunks.set(chunk.id, chunk);
      }
    }

    const scores: Array<{ chunk: MemoryChunk; score: number }> = [];

    for (const chunk of this.chunks.values()) {
      let score = vectorResults.get(chunk.id) ?? 0;

      if (!this.storage?.searchSimilar && queryEmbedding && chunk.embedding) {
        score += cosineSimilarity(queryEmbedding, chunk.embedding) * this.config.hybridWeight.vector;
      }

      score += textScore(query, chunk.content) * this.config.hybridWeight.text;

      if (score >= minScore) {
        scores.push({ chunk, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, maxResults).map(({ chunk, score }) => {
      const lineRange = chunk.startLine === chunk.endLine
        ? `#L${chunk.startLine}`
        : `#L${chunk.startLine}-L${chunk.endLine}`;
      return { chunk, score, citation: `${chunk.path}${lineRange}` };
    });
  }

  // ========================================================================
  // Read
  // ========================================================================

  async readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ path: string; text: string }> {
    const fullPath = path.join(this.config.memoryDir, params.relPath);
    const content = await fs.readFile(fullPath, 'utf-8');

    const lines = content.split('\n');
    const start = (params.from ?? 1) - 1;
    const end = params.lines ? start + params.lines : lines.length;

    return {
      path: params.relPath,
      text: lines.slice(start, end).join('\n'),
    };
  }

  // ========================================================================
  // Stats
  // ========================================================================

  getStats(): { files: number; chunks: number; lastSync: Date | null } {
    const files = new Set<string>();
    for (const chunk of this.chunks.values()) {
      files.add(chunk.path);
    }

    return {
      files: files.size,
      chunks: this.chunks.size,
      lastSync: this.lastSync ? new Date(this.lastSync) : null,
    };
  }
}

// Singleton instance
let globalMemoryContext: MemoryContext | null = null;

export function getMemoryContext(): MemoryContext {
  if (!globalMemoryContext) {
    throw new Error('MemoryContext not initialized');
  }
  return globalMemoryContext;
}

export async function initializeMemoryContext(
  config: MemoryContextConfig,
): Promise<MemoryContext> {
  globalMemoryContext = new MemoryContext(config);
  await globalMemoryContext.initialize();
  return globalMemoryContext;
}
