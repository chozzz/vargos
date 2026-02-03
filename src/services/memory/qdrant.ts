/**
 * Qdrant-based Memory Service
 * Vector search + metadata storage
 * Requires Qdrant running (local or cloud)
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import {
  type IMemoryService,
  type MemoryEntry,
  type MemoryWriteOptions,
  type SearchOptions,
  type SearchResult,
} from '../types.js';

export interface QdrantMemoryConfig {
  url: string;
  apiKey?: string;
  collectionName?: string;
  vectorSize?: number;
  // Optional: OpenAI API key for embeddings
  openaiApiKey?: string;
}

export class QdrantMemoryService implements IMemoryService {
  name = 'qdrant';
  private client: QdrantClient;
  private config: QdrantMemoryConfig;
  private collection: string;
  private vectorSize: number;

  constructor(config: QdrantMemoryConfig) {
    this.config = config;
    this.collection = config.collectionName ?? 'memory';
    this.vectorSize = config.vectorSize ?? 1536; // OpenAI default
    
    this.client = new QdrantClient({
      url: config.url,
      apiKey: config.apiKey,
    });
  }

  async initialize(): Promise<void> {
    // Check if collection exists
    const collections = await this.client.getCollections();
    const exists = collections.collections.some(c => c.name === this.collection);

    if (!exists) {
      // Create collection with cosine distance
      await this.client.createCollection(this.collection, {
        vectors: {
          size: this.vectorSize,
          distance: 'Cosine',
        },
        optimizers_config: {
          default_segment_number: 2,
        },
        replication_factor: 1,
      });

      // Create payload indexes for efficient filtering
      await this.client.createPayloadIndex(this.collection, {
        field_name: 'path',
        field_schema: 'keyword',
      });

      await this.client.createPayloadIndex(this.collection, {
        field_name: 'date',
        field_schema: 'datetime',
      });
    }
  }

  async close(): Promise<void> {
    // Qdrant client doesn't need explicit close for HTTP
  }

  // ==========================================================================
  // Embeddings
  // ==========================================================================

  private async getEmbedding(text: string): Promise<number[]> {
    if (this.config.openaiApiKey) {
      // Use OpenAI embeddings
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.openaiApiKey}`,
        },
        body: JSON.stringify({
          input: text.slice(0, 8000), // Token limit
          model: 'text-embedding-3-small',
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json() as { data: Array<{ embedding: number[] }> };
      return data.data[0].embedding;
    }

    // Fallback: Simple hash-based embedding (not great, but works)
    return this.simpleEmbedding(text);
  }

  private simpleEmbedding(text: string): number[] {
    // Create a simple bag-of-words vector
    // This is NOT semantically meaningful, just for demo
    const vector = new Array(this.vectorSize).fill(0);
    const words = text.toLowerCase().split(/\W+/);
    
    for (const word of words) {
      for (let i = 0; i < word.length; i++) {
        const char = word.charCodeAt(i);
        vector[char % this.vectorSize] += 1 / words.length;
      }
    }
    
    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map(v => magnitude > 0 ? v / magnitude : 0);
  }

  // ==========================================================================
  // CRUD Operations (file path as metadata)
  // ==========================================================================

  async write(path: string, content: string, options?: MemoryWriteOptions): Promise<void> {
    const chunkSize = 500; // Lines per chunk
    const lines = content.split('\n');
    const chunks = [] as {start: number; end: number; text: string}[];

    for (let i = 0; i < lines.length; i += chunkSize) {
      const start = i;
      const end = Math.min(i + chunkSize, lines.length);
      chunks.push({
        start,
        end,
        text: lines.slice(start, end).join('\n'),
      });
    }

    // Delete old chunks for this path
    await this.deleteByPath(path);

    // Insert new chunks
    const now = new Date().toISOString();
    for (const chunk of chunks) {
      const embedding = await this.getEmbedding(chunk.text);
      const id = `${path}:${chunk.start}-${chunk.end}`;
      
      await this.client.upsert(this.collection, {
        points: [{
          id,
          vector: embedding,
          payload: {
            path,
            content: chunk.text,
            from: chunk.start,
            to: chunk.end,
            date: now,
            ...options?.metadata,
          },
        }],
      });
    }
  }

  async read(filePath: string, options?: { offset?: number; limit?: number }): Promise<string> {
    const points = await this.client.query(this.collection, {
      query: {
        must: [
          { key: 'path', match: { value: filePath } },
        ],
      },
    });

    if (points.points.length === 0) {
      throw new Error(`Memory file not found: ${filePath}`);
    }

    // Sort by line number
    const sorted = points.points
      .map(p => ({
        from: (p.payload?.from as number) ?? 0,
        content: (p.payload?.content as string) ?? '',
      }))
      .sort((a, b) => a.from - b.from);

    let lines = sorted.map(s => s.content).join('\n').split('\n');

    if (options?.offset || options?.limit) {
      const start = options.offset ?? 0;
      const end = options.limit ? start + options.limit : lines.length;
      lines = lines.slice(start, end);
    }

    return lines.join('\n');
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await this.read(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(filePath: string): Promise<void> {
    await this.deleteByPath(filePath);
  }

  private async deleteByPath(filePath: string): Promise<void> {
    // Delete all points with this path
    await this.client.delete(this.collection, {
      filter: {
        must: [
          { key: 'path', match: { value: filePath } },
        ],
      },
    });
  }

  async list(directory: string): Promise<string[]> {
    const points = await this.client.scroll(this.collection, {
      limit: 10000,
    });

    const paths = new Set<string>();
    for (const point of points.points) {
      const path = point.payload?.path as string;
      if (path?.startsWith(directory)) {
        paths.add(path);
      }
    }

    return Array.from(paths).sort();
  }

  // ==========================================================================
  // Search (Vector-based)
  // ==========================================================================

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const embedding = await this.getEmbedding(query);
    
    const results = await this.client.search(this.collection, {
      vector: embedding,
      limit: options.limit ?? 10,
      score_threshold: options.minScore ?? 0,
      filter: this.buildFilter(options),
    });

    return results.map(r => ({
      content: (r.payload?.content as string) ?? '',
      score: r.score ?? 0,
      metadata: {
        path: (r.payload?.path as string) ?? '',
        from: (r.payload?.from as number) ?? 0,
        to: (r.payload?.to as number) ?? 0,
        date: (r.payload?.date as string) ?? new Date().toISOString(),
      },
    }));
  }

  private buildFilter(options: SearchOptions): Record<string, unknown> | undefined {
    const must: Array<Record<string, unknown>> = [];
    const should: Array<Record<string, unknown>> = [];

    if (options.filters?.dateFrom) {
      must.push({
        key: 'date',
        range: {
          gte: options.filters.dateFrom.toISOString(),
        },
      });
    }

    if (options.filters?.dateTo) {
      must.push({
        key: 'date',
        range: {
          lte: options.filters.dateTo.toISOString(),
        },
      });
    }

    if (options.filters?.paths && options.filters.paths.length > 0) {
      should.push(
        ...options.filters.paths.map((p: string) => ({
          key: 'path',
          match: { value: p },
        }))
      );
    }

    if (must.length === 0) return undefined;

    return should.length > 0 ? { must, should } : { must };
  }
}
