import { promises as fs } from 'node:fs';
import path from 'node:path';
import { glob } from 'tinyglobby';
import { FSWatcher, watch } from 'node:fs';
import type { MemoryStorage, MemoryChunk } from './types.js';
import { createLogger } from '../../lib/logger.js';
import { generateEmbedding, cosineSimilarity, textScore } from './embedding.js';
import type { EmbeddingConfig } from './embedding.js';
import { createChunks } from './chunker.js';
import { indexSessions } from './session-indexer.js';

export type { MemoryChunk };

const log = createLogger('memory');

export interface ContextSearchResult {
  chunk:    MemoryChunk;
  score:    number;
  citation: string;
}

export interface MemoryContextConfig {
  memoryDir:         string;
  cacheDir:          string;
  sessionsDir?:      string;
  chunkSize?:        number;
  chunkOverlap?:     number;
  embeddingProvider?: 'openai' | 'local' | 'none';
  openaiApiKey?:     string;
  embeddingModel?:   string;
  hybridWeight?:     { vector: number; text: number };
  storage?:          MemoryStorage;
  enableFileWatcher?: boolean;
}

export class MemoryContext {
  private readonly chunkSize:        number;
  private readonly chunkOverlap:     number;
  private readonly embeddingProvider: 'openai' | 'local' | 'none';
  private readonly hybridWeight:     { vector: number; text: number };
  private readonly enableFileWatcher: boolean;
  private readonly embeddingConfig:  EmbeddingConfig;

  private chunks: Map<string, MemoryChunk> = new Map();
  private lastSync = 0;
  private storage: MemoryStorage | null    = null;
  private fileWatcher: FSWatcher | null    = null;
  private watcherDebounce = new Map<string, NodeJS.Timeout>();

  constructor(private readonly config: MemoryContextConfig) {
    this.chunkSize         = config.chunkSize        ?? 400;
    this.chunkOverlap      = config.chunkOverlap     ?? 80;
    this.embeddingProvider = config.embeddingProvider ?? 'none';
    this.hybridWeight      = config.hybridWeight     ?? { vector: 0.7, text: 0.3 };
    this.enableFileWatcher = config.enableFileWatcher ?? false;
    this.embeddingConfig   = {
      provider:     this.embeddingProvider,
      openaiApiKey: config.openaiApiKey,
      model:        config.embeddingModel,
    };
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.config.cacheDir, { recursive: true });

    if (this.config.storage) {
      this.storage = this.config.storage;
      await this.storage.initialize();
      for (const chunk of await this.storage.getAllChunks()) {
        this.chunks.set(chunk.id, chunk);
      }
    }

    await this.sync({ reason: 'init' });

    if (this.enableFileWatcher) this.startFileWatcher();
  }

  async close(): Promise<void> {
    this.stopFileWatcher();
    await this.storage?.close();
    this.storage = null;
  }

  // ── Indexing ───────────────────────────────────────────────────────────────

  async sync(options?: { reason?: string; force?: boolean }): Promise<void> {
    const now = Date.now();
    if (!options?.force && now - this.lastSync < 5_000) return;

    const files = await glob('**/*.md', { cwd: this.config.memoryDir, absolute: true });
    for (const file of files) {
      const relPath = path.relative(this.config.memoryDir, file);
      const needsReindex = await this.checkNeedsReindex(relPath, file);
      if (options?.force || needsReindex) await this.indexFile(relPath);
    }

    if (this.config.sessionsDir) {
      const embed = (text: string) => generateEmbedding(text, this.embeddingConfig);
      const sessionChunks = await indexSessions(this.config.sessionsDir, embed);
      for (const chunk of sessionChunks) {
        this.chunks.set(chunk.id, chunk);
        await this.storage?.saveChunk(chunk);
      }
    }

    this.lastSync = Date.now();
  }

  private async checkNeedsReindex(relPath: string, fullPath: string): Promise<boolean> {
    if (!this.storage) return true;
    const stat   = await fs.stat(fullPath).catch(() => null);
    if (!stat) return true;
    const status = await this.storage.getFileStatus(relPath);
    if (!status) return true;
    return status.mtime !== stat.mtime.getTime() || status.size !== stat.size;
  }

  private async indexFile(relPath: string): Promise<void> {
    const fullPath = path.join(this.config.memoryDir, relPath);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const stat    = await fs.stat(fullPath);

      this.removeFileChunks(relPath);
      await this.storage?.deleteChunksByPath(relPath);

      const chunks = createChunks(relPath, content, stat.mtime, {
        chunkSize: this.chunkSize, chunkOverlap: this.chunkOverlap,
      });

      if (this.embeddingProvider !== 'none') {
        for (const chunk of chunks) {
          chunk.embedding = await generateEmbedding(chunk.content, this.embeddingConfig);
        }
      }

      for (const chunk of chunks) {
        this.chunks.set(chunk.id, chunk);
        await this.storage?.saveChunk(chunk);
      }

      await this.storage?.updateFileStatus(relPath, stat.mtime.getTime(), stat.size);
    } catch (err) {
      log.error('failed to index', { relPath, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private removeFileChunks(relPath: string): void {
    for (const [id, chunk] of this.chunks) {
      if (chunk.path === relPath) this.chunks.delete(id);
    }
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  async search(
    query: string,
    options: { maxResults?: number; minScore?: number } = {},
  ): Promise<ContextSearchResult[]> {
    await this.sync();

    const maxResults     = options.maxResults ?? 6;
    const minScore       = options.minScore   ?? 0.3;
    const queryEmbedding = await generateEmbedding(query, this.embeddingConfig);

    const vectorResults = new Map<string, number>();
    if (queryEmbedding && this.storage?.searchSimilar) {
      const hits = await this.storage.searchSimilar(queryEmbedding, maxResults * 2, minScore);
      for (const { chunk, score } of hits) {
        vectorResults.set(chunk.id, score * this.hybridWeight.vector);
        if (!this.chunks.has(chunk.id)) this.chunks.set(chunk.id, chunk);
      }
    }

    const scores: Array<{ chunk: MemoryChunk; score: number }> = [];

    for (const chunk of this.chunks.values()) {
      let score = vectorResults.get(chunk.id) ?? 0;

      if (!this.storage?.searchSimilar && queryEmbedding && chunk.embedding) {
        score += cosineSimilarity(queryEmbedding, chunk.embedding) * this.hybridWeight.vector;
      }

      score += textScore(query, chunk.content) * this.hybridWeight.text;
      if (score >= minScore) scores.push({ chunk, score });
    }

    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, maxResults).map(({ chunk, score }) => ({
      chunk,
      score,
      citation: chunk.startLine === chunk.endLine
        ? `${chunk.path}#L${chunk.startLine}`
        : `${chunk.path}#L${chunk.startLine}-L${chunk.endLine}`,
    }));
  }

  // ── Read / Write ───────────────────────────────────────────────────────────

  async readFile(params: { relPath: string; from?: number; lines?: number }): Promise<{ path: string; text: string }> {
    const fullPath = path.resolve(this.config.memoryDir, params.relPath);
    if (!fullPath.startsWith(path.resolve(this.config.memoryDir))) {
      throw new Error('Path traversal denied');
    }
    const content = await fs.readFile(fullPath, 'utf-8');
    const lines   = content.split('\n');
    const start   = (params.from ?? 1) - 1;
    const end     = params.lines ? start + params.lines : lines.length;
    return { path: params.relPath, text: lines.slice(start, end).join('\n') };
  }

  async writeFile(relPath: string, content: string, mode: 'overwrite' | 'append' = 'overwrite'): Promise<void> {
    const fullPath = path.resolve(this.config.memoryDir, relPath);
    if (!fullPath.startsWith(path.resolve(this.config.memoryDir))) {
      throw new Error('Path traversal denied');
    }
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    if (mode === 'append') {
      await fs.appendFile(fullPath, content);
    } else {
      await fs.writeFile(fullPath, content, 'utf-8');
    }
    // Re-index the changed file
    const relNorm = path.relative(this.config.memoryDir, fullPath);
    await this.indexFile(relNorm);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  getStats(): { files: number; chunks: number; lastSync: Date | null } {
    const files = new Set<string>();
    for (const chunk of this.chunks.values()) files.add(chunk.path);
    return {
      files:    files.size,
      chunks:   this.chunks.size,
      lastSync: this.lastSync ? new Date(this.lastSync) : null,
    };
  }

  // ── File watcher ───────────────────────────────────────────────────────────

  private startFileWatcher(): void {
    if (this.fileWatcher) return;
    try {
      this.fileWatcher = watch(this.config.memoryDir, { recursive: true }, (_, filename) => {
        if (!filename?.endsWith('.md')) return;
        const fullPath = path.join(this.config.memoryDir, filename);
        const existing = this.watcherDebounce.get(fullPath);
        if (existing) clearTimeout(existing);
        const timeout = setTimeout(async () => {
          this.watcherDebounce.delete(fullPath);
          await this.indexFile(filename);
        }, 500);
        this.watcherDebounce.set(fullPath, timeout);
      });
    } catch (err) {
      log.error('failed to start file watcher', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private stopFileWatcher(): void {
    for (const t of this.watcherDebounce.values()) clearTimeout(t);
    this.watcherDebounce.clear();
    this.fileWatcher?.close();
    this.fileWatcher = null;
  }
}
