/**
 * PostgreSQL + pgvector storage for MemoryContext
 * Native vector similarity search, no filesystem locking issues
 */

import pg from 'pg';
import pgvector from 'pgvector/pg';
import type { MemoryChunk, MemoryStorage } from './storage.js';

export interface PostgresStorageConfig {
  url: string;
}

export class MemoryPostgresStorage implements MemoryStorage {
  private config: PostgresStorageConfig;
  private pool: pg.Pool | null = null;

  constructor(config: PostgresStorageConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    const dbName = new URL(this.config.url).pathname.slice(1);

    // Try connecting to the target database
    try {
      this.pool = new pg.Pool({ connectionString: this.config.url });
      await this.pool.query('SELECT 1');
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      // 3D000 = database does not exist
      if (pgErr.code !== '3D000') throw err;

      await this.pool?.end();

      // Connect to default postgres db and create target
      const baseUrl = new URL(this.config.url);
      baseUrl.pathname = '/postgres';
      const bootstrapPool = new pg.Pool({ connectionString: baseUrl.toString() });
      try {
        // Identifier cannot be parameterized — validate it
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
          throw new Error(`Invalid database name: ${dbName}`);
        }
        await bootstrapPool.query(`CREATE DATABASE ${dbName}`);
      } finally {
        await bootstrapPool.end();
      }

      // Reconnect to the new database
      this.pool = new pg.Pool({ connectionString: this.config.url });
    }

    // Ensure pgvector extension exists — needs superuser or extension already installed
    try {
      await this.pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      // 42501 = insufficient_privilege — check if extension already exists
      if (pgErr.code === '42501') {
        const { rows } = await this.pool.query(
          "SELECT 1 FROM pg_extension WHERE extname = 'vector'",
        );
        if (rows.length === 0) {
          throw new Error(
            'pgvector extension not installed and current user lacks CREATE EXTENSION privilege. '
            + 'Run as superuser: CREATE EXTENSION vector;',
          );
        }
      } else {
        throw err;
      }
    }

    // Register pgvector types — must happen after extension is confirmed
    this.pool.on('connect', async (client) => {
      await pgvector.registerTypes(client);
    });
    const client = await this.pool.connect();
    try {
      await pgvector.registerTypes(client);
    } finally {
      client.release();
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        start_line INT NOT NULL,
        end_line INT NOT NULL,
        embedding vector(1536),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path)`);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        mtime BIGINT NOT NULL,
        size BIGINT NOT NULL,
        indexed_at TIMESTAMPTZ DEFAULT now()
      )
    `);
  }

  async saveChunk(chunk: MemoryChunk): Promise<void> {
    if (!this.pool) throw new Error('Database not initialized');

    await this.pool.query(
      `INSERT INTO chunks (id, path, content, start_line, end_line, embedding, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         content = EXCLUDED.content,
         start_line = EXCLUDED.start_line,
         end_line = EXCLUDED.end_line,
         embedding = EXCLUDED.embedding,
         metadata = EXCLUDED.metadata`,
      [
        chunk.id,
        chunk.path,
        chunk.content,
        chunk.startLine,
        chunk.endLine,
        chunk.embedding ? pgvector.toSql(chunk.embedding) : null,
        JSON.stringify(chunk.metadata),
      ],
    );
  }

  async getChunksByPath(filePath: string): Promise<MemoryChunk[]> {
    if (!this.pool) throw new Error('Database not initialized');

    const { rows } = await this.pool.query(
      'SELECT * FROM chunks WHERE path = $1 ORDER BY start_line',
      [filePath],
    );
    return rows.map(this.rowToChunk);
  }

  async getAllChunks(): Promise<MemoryChunk[]> {
    if (!this.pool) throw new Error('Database not initialized');

    const { rows } = await this.pool.query('SELECT * FROM chunks ORDER BY path, start_line');
    return rows.map(this.rowToChunk);
  }

  async deleteChunksByPath(filePath: string): Promise<void> {
    if (!this.pool) throw new Error('Database not initialized');
    await this.pool.query('DELETE FROM chunks WHERE path = $1', [filePath]);
  }

  async updateFileStatus(filePath: string, mtime: number, size: number): Promise<void> {
    if (!this.pool) throw new Error('Database not initialized');

    await this.pool.query(
      `INSERT INTO files (path, mtime, size, indexed_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (path) DO UPDATE SET
         mtime = EXCLUDED.mtime,
         size = EXCLUDED.size,
         indexed_at = now()`,
      [filePath, mtime, size],
    );
  }

  async getFileStatus(filePath: string): Promise<{ mtime: number; size: number; indexedAt: number } | null> {
    if (!this.pool) throw new Error('Database not initialized');

    const { rows } = await this.pool.query('SELECT * FROM files WHERE path = $1', [filePath]);
    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      mtime: Number(row.mtime),
      size: Number(row.size),
      indexedAt: new Date(row.indexed_at).getTime(),
    };
  }

  async getStats(): Promise<{ fileCount: number; chunkCount: number }> {
    if (!this.pool) throw new Error('Database not initialized');

    const [files, chunks] = await Promise.all([
      this.pool.query('SELECT COUNT(*) as count FROM files'),
      this.pool.query('SELECT COUNT(*) as count FROM chunks'),
    ]);

    return {
      fileCount: Number(files.rows[0].count),
      chunkCount: Number(chunks.rows[0].count),
    };
  }

  async searchSimilar(
    embedding: number[],
    limit: number,
    minScore = 0,
  ): Promise<Array<{ chunk: MemoryChunk; score: number }>> {
    if (!this.pool) throw new Error('Database not initialized');

    const { rows } = await this.pool.query(
      `SELECT *, 1 - (embedding <=> $1::vector) AS score
       FROM chunks
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [pgvector.toSql(embedding), limit],
    );

    return rows
      .filter((row: Record<string, unknown>) => Number(row.score) >= minScore)
      .map((row: Record<string, unknown>) => ({
        chunk: this.rowToChunk(row),
        score: Number(row.score),
      }));
  }

  private rowToChunk(row: Record<string, unknown>): MemoryChunk {
    return {
      id: row.id as string,
      path: row.path as string,
      content: row.content as string,
      startLine: row.start_line as number,
      endLine: row.end_line as number,
      embedding: row.embedding ? (row.embedding as number[]) : undefined,
      metadata: (row.metadata ?? {}) as MemoryChunk['metadata'],
    };
  }

  async close(): Promise<void> {
    await this.pool?.end();
    this.pool = null;
  }
}
