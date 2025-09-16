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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  };
}

export interface SearchResult {
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
}

export class MemoryContext {
  private config: Required<MemoryContextConfig>;
  private chunks: Map<string, MemoryChunk> = new Map();
  private lastSync: number = 0;

  constructor(config: MemoryContextConfig) {
    this.config = {
      chunkSize: 400,
      chunkOverlap: 80,
      embeddingProvider: 'none',
      hybridWeight: { vector: 0.7, text: 0.3 },
      ...config,
    };
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.config.cacheDir, { recursive: true });
    await this.sync({ reason: 'initialization' });
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
      await this.indexFile(relativePath);
      indexed++;
    }

    this.lastSync = now;
    options?.progress?.(`Indexed ${indexed} files, ${this.chunks.size} chunks`);
  }

  private async indexFile(relPath: string): Promise<void> {
    const fullPath = path.join(this.config.memoryDir, relPath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const stat = await fs.stat(fullPath);
      
      // Remove old chunks for this file
      this.removeFileChunks(relPath);
      
      // Create new chunks
      const chunks = this.createChunks(relPath, content, stat.mtime);
      
      // Generate embeddings if provider configured
      if (this.config.embeddingProvider !== 'none') {
        for (const chunk of chunks) {
          chunk.embedding = await this.generateEmbedding(chunk.content);
        }
      }
      
      // Store chunks
      for (const chunk of chunks) {
        this.chunks.set(chunk.id, chunk);
      }
    } catch (err) {
      console.error(`Failed to index ${relPath}:`, err);
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
  ): Promise<SearchResult[]> {
    // Sync before search
    await this.sync();
    
    const maxResults = options.maxResults ?? 6;
    const minScore = options.minScore ?? 0.3;
    
    // Generate query embedding if using vector search
    const queryEmbedding = await this.generateEmbedding(query);
    
    // Score all chunks
    const scores: Array<{ chunk: MemoryChunk; score: number }> = [];
    
    for (const chunk of this.chunks.values()) {
      let score = 0;
      
      // Vector similarity (cosine)
      if (queryEmbedding && chunk.embedding) {
        const vectorScore = this.cosineSimilarity(queryEmbedding, chunk.embedding);
        score += vectorScore * this.config.hybridWeight.vector;
      }
      
      // Text match (BM25-ish)
      const textScore = this.textScore(query, chunk.content);
      score += textScore * this.config.hybridWeight.text;
      
      if (score >= minScore) {
        scores.push({ chunk, score });
      }
    }
    
    // Sort by score and return top results
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
