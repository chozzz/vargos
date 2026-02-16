/**
 * SQLite storage for MemoryContext
 * Persists embeddings and chunk metadata across restarts
 */

import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { MemoryChunk, MemoryStorage } from './storage.js';

export interface SQLiteStorageConfig {
  dbPath: string;
}

export class MemorySQLiteStorage implements MemoryStorage {
  private config: SQLiteStorageConfig;
  private db: BetterSqlite3.Database | null = null;

  constructor(config: SQLiteStorageConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    const dir = path.dirname(this.config.dbPath);
    await fs.mkdir(dir, { recursive: true });

    this.db = new Database(this.config.dbPath);
    // DELETE mode — WAL requires mmap which breaks on network filesystems (NFS/CIFS)
    this.db.pragma('journal_mode = DELETE');
    this.createTables();
  }

  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        embedding TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_created ON chunks(created_at)`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        mtime INTEGER NOT NULL,
        size INTEGER NOT NULL,
        indexed_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
  }

  async saveChunk(chunk: MemoryChunk): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.prepare(
      `INSERT OR REPLACE INTO chunks (id, path, content, start_line, end_line, embedding, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      chunk.id,
      chunk.path,
      chunk.content,
      chunk.startLine,
      chunk.endLine,
      chunk.embedding ? JSON.stringify(chunk.embedding) : null,
      JSON.stringify(chunk.metadata),
    );
  }

  async getChunksByPath(filePath: string): Promise<MemoryChunk[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db.prepare('SELECT * FROM chunks WHERE path = ? ORDER BY start_line').all(filePath);
    return rows.map(row => this.rowToChunk(row as Record<string, unknown>));
  }

  async getAllChunks(): Promise<MemoryChunk[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db.prepare('SELECT * FROM chunks ORDER BY path, start_line').all();
    return rows.map(row => this.rowToChunk(row as Record<string, unknown>));
  }

  async deleteChunksByPath(filePath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('DELETE FROM chunks WHERE path = ?').run(filePath);
  }

  async updateFileStatus(filePath: string, mtime: number, size: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.prepare(
      'INSERT OR REPLACE INTO files (path, mtime, size, indexed_at) VALUES (?, ?, ?, unixepoch())'
    ).run(filePath, mtime, size);
  }

  async getFileStatus(filePath: string): Promise<{ mtime: number; size: number; indexedAt: number } | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.prepare('SELECT * FROM files WHERE path = ?').get(filePath) as Record<string, unknown> | undefined;
    if (!row) return null;

    return {
      mtime: row.mtime as number,
      size: row.size as number,
      indexedAt: row.indexed_at as number,
    };
  }

  async getStats(): Promise<{ fileCount: number; chunkCount: number }> {
    if (!this.db) throw new Error('Database not initialized');

    const fileResult = this.db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number };
    const chunkResult = this.db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number };

    return {
      fileCount: fileResult?.count ?? 0,
      chunkCount: chunkResult?.count ?? 0,
    };
  }

  private rowToChunk(row: Record<string, unknown>): MemoryChunk {
    return {
      id: row.id as string,
      path: row.path as string,
      content: row.content as string,
      startLine: row.start_line as number,
      endLine: row.end_line as number,
      embedding: row.embedding ? JSON.parse(row.embedding as string) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : {},
    };
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
