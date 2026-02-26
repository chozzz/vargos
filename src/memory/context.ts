/**
 * Memory context system for Vargos
 * Inspired by OpenClaw's memory architecture
 * 
 * Features:
 * - Hybrid search (vector + text)
 * - Automatic indexing/sync
 * - Chunking with overlap
 * - Citations
 * - SQLite storage
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { glob } from 'tinyglobby';
import { fileURLToPath } from 'node:url';
import type { MemoryStorage, MemoryChunk } from './types.js';
import { FSWatcher, watch } from 'node:fs';
import { createLogger } from '../lib/logger.js';
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
  chunkSize?: number;      // tokens (approximate)
  chunkOverlap?: number;   // tokens
  embeddingProvider?: 'openai' | 'local' | 'none';
  openaiApiKey?: string;
  hybridWeight?: {         // 0-1 for each
    vector: number;
    text: number;
  };
  storage?: MemoryStorage;
  sessionsDir?: string;          // Session transcripts for indexing
  enableFileWatcher?: boolean;   // Auto-reindex on file changes
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

    // Initialize storage if provided
    if (this.config.storage) {
      this.storage = this.config.storage;
      await this.storage.initialize();

      // Load cached chunks into memory for text search
      const cachedChunks = await this.storage.getAllChunks();
      for (const chunk of cachedChunks) {
        this.chunks.set(chunk.id, chunk);
      }
    }

    await this.sync({ reason: 'initialization' });

    // Start file watcher if enabled
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

        // Debounce per file
        const existing = this.watcherDebounce.get(fullPath);
        if (existing) clearTimeout(existing);

        const timeout = setTimeout(async () => {
          this.watcherDebounce.delete(fullPath);
          log.debug(`File changed: ${filename}`);
          await this.indexFile(filename, { force: true });
        }, 500); // 500ms debounce

        this.watcherDebounce.set(fullPath, timeout);
      });
    } catch (err) {
      log.error('Failed to start file watcher:', err);
    }
  }

  private stopFileWatcher(): void {
    // Clear pending debounces
    for (const timeout of this.watcherDebounce.values()) {
      clearTimeout(timeout);
    }
    this.watcherDebounce.clear();

    // Close watcher
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
    
    // Don't sync too frequently (unless forced)
    if (!options?.force && now - this.lastSync < 5000) {
      return;
    }

    options?.progress?.(`Syncing memory from ${this.config.memoryDir}...`);

    // Find all markdown files
    const files = await glob('**/*.md', { 
      cwd: this.config.memoryDir,
      absolute: true,
    });

    // Index each file
    let indexed = 0;
    for (const file of files) {
      const relativePath = path.relative(this.config.memoryDir, file);
      const needsReindex = await this.checkNeedsReindex(relativePath, file);
      if (options?.force || needsReindex) {
        await this.indexFile(relativePath, options);
        indexed++;
      }
    }

    // Index session transcripts if configured
    if (this.config.sessionsDir) {
      const sessionChunks = await this.indexSessions();
      options?.progress?.(`Indexed ${sessionChunks} session chunks`);
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

      // Remove old chunks for this file
      this.removeFileChunks(relPath);
      await this.storage?.deleteChunksByPath(relPath);

      // Create new chunks
      const chunks = this.createChunks(relPath, content, stat.mtime);

      // Generate embeddings if provider configured
      if (this.config.embeddingProvider !== 'none') {
        for (const chunk of chunks) {
          chunk.embedding = await this.generateEmbedding(chunk.content);
        }
      }

      // Store chunks in memory and SQLite
      for (const chunk of chunks) {
        this.chunks.set(chunk.id, chunk);
        await this.storage?.saveChunk(chunk);
      }

      // Update file status in SQLite
      await this.storage?.updateFileStatus(relPath, stat.mtime.getTime(), stat.size);

      options?.progress?.(`Indexed ${relPath}: ${chunks.length} chunks`);
    } catch (err) {
      log.error(`Failed to index ${relPath}:`, err);
    }
  }

  // ========================================================================
  // Session Indexing
  // ========================================================================

  private async indexSessions(): Promise<number> {
    if (!this.config.sessionsDir) return 0;

    let totalChunks = 0;

    try {
      const sessionFiles = await glob('**/*.jsonl', {
        cwd: this.config.sessionsDir,
        absolute: true,
      });

      for (const file of sessionFiles) {
        const chunks = await this.indexSessionFile(file);
        totalChunks += chunks;
      }
    } catch (err) {
      log.error('Failed to index sessions:', err);
    }

    return totalChunks;
  }

  private async indexSessionFile(filePath: string): Promise<number> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const stat = await fs.stat(filePath);
      const fileName = path.basename(filePath, '.jsonl');

      // Parse JSONL to extract messages
      const lines = content.trim().split('\n').filter(Boolean);
      if (lines.length === 0) return 0;

      // Parse session header
      const session = JSON.parse(lines[0]) as { sessionKey?: string; label?: string; agentId?: string };

      // Remove old session chunks
      const sessionPath = `sessions/${fileName}.jsonl`;
      this.removeFileChunks(sessionPath);
      await this.storage?.deleteChunksByPath(sessionPath);

      // Index messages (skip header line)
      const chunks: MemoryChunk[] = [];
      for (let i = 1; i < lines.length; i++) {
        try {
          const msg = JSON.parse(lines[i]) as { role?: string; content?: string; timestamp?: string };
          if (!msg.content) continue;

          const chunk: MemoryChunk = {
            id: `${sessionPath}:${i}`,
            path: sessionPath,
            content: `[${msg.role}] ${msg.content}`,
            startLine: i,
            endLine: i,
            metadata: {
              date: stat.mtime.toISOString(),
              size: msg.content.length,
              sessionKey: session.sessionKey,
              sessionLabel: session.label,
              role: msg.role,
            },
          };

          // Generate embedding if provider configured
          if (this.config.embeddingProvider !== 'none') {
            chunk.embedding = await this.generateEmbedding(chunk.content);
          }

          chunks.push(chunk);
        } catch {
          // Skip malformed lines
        }
      }

      // Store chunks
      for (const chunk of chunks) {
        this.chunks.set(chunk.id, chunk);
        await this.storage?.saveChunk(chunk);
      }

      // Update file status
      await this.storage?.updateFileStatus(sessionPath, stat.mtime.getTime(), stat.size);

      return chunks.length;
    } catch (err) {
      log.error(`Failed to index session ${filePath}:`, err);
      return 0;
    }
  }

  private removeFileChunks(relPath: string): void {
    for (const [id, chunk] of this.chunks) {
      if (chunk.path === relPath) {
        this.chunks.delete(id);
      }
    }
  }

  private createChunks(
    relPath: string, 
    content: string, 
    mtime: Date
  ): MemoryChunk[] {
    const lines = content.split('\n');
    const chunks: MemoryChunk[] = [];
    
    // Approximate tokens: ~4 chars per token
    const charsPerChunk = this.config.chunkSize * 4;
    const overlapChars = this.config.chunkOverlap * 4;
    
    let currentChunk: string[] = [];
    let currentChars = 0;
    let chunkStartLine = 1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentChunk.push(line);
      currentChars += line.length + 1; // +1 for newline
      
      if (currentChars >= charsPerChunk) {
        // Save chunk
        const chunkContent = currentChunk.join('\n');
        chunks.push({
          id: `${relPath}:${chunkStartLine}`,
          path: relPath,
          content: chunkContent,
          startLine: chunkStartLine,
          endLine: i + 1,
          metadata: {
            date: mtime.toISOString(),
            size: chunkContent.length,
          },
        });
        
        // Start new chunk with overlap
        const overlapLines = Math.floor(overlapChars / (currentChars / currentChunk.length));
        currentChunk = currentChunk.slice(-overlapLines);
        currentChars = currentChunk.reduce((sum, l) => sum + l.length + 1, 0);
        chunkStartLine = i + 1 - currentChunk.length + 1;
      }
    }
    
    // Don't forget the last chunk
    if (currentChunk.length > 0) {
      const chunkContent = currentChunk.join('\n');
      chunks.push({
        id: `${relPath}:${chunkStartLine}`,
        path: relPath,
        content: chunkContent,
        startLine: chunkStartLine,
        endLine: lines.length,
        metadata: {
          date: mtime.toISOString(),
          size: chunkContent.length,
        },
      });
    }
    
    return chunks;
  }

  // ========================================================================
  // Embeddings
  // ========================================================================

  private async generateEmbedding(text: string): Promise<number[] | undefined> {
    if (this.config.embeddingProvider === 'openai' && this.config.openaiApiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: text.slice(0, 8000),
            model: 'text-embedding-3-small',
          }),
        });
        
        if (!response.ok) return undefined;
        
        const data = await response.json() as { data: Array<{ embedding: number[] }> };
        return data.data[0].embedding;
      } catch {
        return undefined;
      }
    }
    
    // Simple hash-based fallback (not semantic, but deterministic)
    return this.simpleEmbedding(text);
  }

  private simpleEmbedding(text: string): number[] {
    const dim = 384; // Small dimension for efficiency
    const vec = new Float32Array(dim);
    
    // Character n-gram hashing
    const normalized = text.toLowerCase();
    for (let i = 0; i < normalized.length - 2; i++) {
      const trigram = normalized.slice(i, i + 3);
      let hash = 0;
      for (let j = 0; j < trigram.length; j++) {
        hash = ((hash << 5) - hash) + trigram.charCodeAt(j);
        hash = hash & hash;
      }
      vec[Math.abs(hash) % dim] += 1;
    }
    
    // Normalize
    const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < dim; i++) {
        vec[i] /= magnitude;
      }
    }
    
    return Array.from(vec);
  }

  // ========================================================================
  // Search
  // ========================================================================

  async search(
    query: string, 
    options: { 
      maxResults?: number;
      minScore?: number;
    } = {}
  ): Promise<ContextSearchResult[]> {
    // Sync before search
    await this.sync();
    
    const maxResults = options.maxResults ?? 6;
    const minScore = options.minScore ?? 0.3;
    
    const queryEmbedding = await this.generateEmbedding(query);

    // Vector search: delegate to storage when it supports native similarity
    const vectorResults: Map<string, number> = new Map();
    if (queryEmbedding && this.storage?.searchSimilar) {
      const hits = await this.storage.searchSimilar(queryEmbedding, maxResults * 2, minScore);
      for (const { chunk, score } of hits) {
        vectorResults.set(chunk.id, score * this.config.hybridWeight.vector);
        // Ensure chunk is available for text scoring
        if (!this.chunks.has(chunk.id)) this.chunks.set(chunk.id, chunk);
      }
    }

    // Score all in-memory chunks (text + optional JS-side vector)
    const scores: Array<{ chunk: MemoryChunk; score: number }> = [];

    for (const chunk of this.chunks.values()) {
      let score = vectorResults.get(chunk.id) ?? 0;

      // JS-side cosine fallback when storage lacks searchSimilar
      if (!this.storage?.searchSimilar && queryEmbedding && chunk.embedding) {
        score += this.cosineSimilarity(queryEmbedding, chunk.embedding) * this.config.hybridWeight.vector;
      }

      // Text match (BM25-ish)
      score += this.textScore(query, chunk.content) * this.config.hybridWeight.text;

      if (score >= minScore) {
        scores.push({ chunk, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, maxResults).map(({ chunk, score }) => ({
      chunk,
      score,
      citation: this.formatCitation(chunk),
    }));
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
  }

  private textScore(query: string, content: string): number {
    const queryTerms = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
    const contentLower = content.toLowerCase();
    
    if (queryTerms.length === 0) return 0;
    
    let matches = 0;
    for (const term of queryTerms) {
      if (contentLower.includes(term)) {
        matches++;
      }
    }
    
    // IDF would be better, but this works for small corpora
    return matches / queryTerms.length;
  }

  private formatCitation(chunk: MemoryChunk): string {
    const lineRange = chunk.startLine === chunk.endLine
      ? `#L${chunk.startLine}`
      : `#L${chunk.startLine}-L${chunk.endLine}`;
    return `${chunk.path}${lineRange}`;
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
    const end = params.lines 
      ? start + params.lines 
      : lines.length;
    
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
  config: MemoryContextConfig
): Promise<MemoryContext> {
  globalMemoryContext = new MemoryContext(config);
  await globalMemoryContext.initialize();
  return globalMemoryContext;
}
