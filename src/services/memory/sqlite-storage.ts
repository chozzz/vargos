/**
 * SQLite storage for MemoryContext
 * Persists embeddings and chunk metadata across restarts
 */

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'node:path';
import { MemoryChunk } from './context.js';

export interface SQLiteStorageConfig {
  dbPath: string;
}

export class MemorySQLiteStorage {
  private config: SQLiteStorageConfig;
  private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

  constructor(config: SQLiteStorageConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.config.dbPath);
    await fs.mkdir(dir, { recursive: true });

    this.db = await open({
      filename: this.config.dbPath,
      driver: sqlite3.Database,
    });

    // Enable WAL mode for better concurrency
    await this.db.run('PRAGMA journal_mode = WAL');

    // Create tables
    await this.createTables();
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Chunks table with JSON for embeddings
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        embedding TEXT, -- JSON array
        metadata TEXT, -- JSON object
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);

    // Create indexes
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_chunks_created ON chunks(created_at)`);

    // Files table for tracking modified times
    await this.db.run(`
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

    await this.db.run(
      `INSERT OR REPLACE INTO chunks (id, path, content, start_line, end_line, embedding, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      chunk.id,
      chunk.path,
      chunk.content,
      chunk.startLine,
      chunk.endLine,
      chunk.embedding ? JSON.stringify(chunk.embedding) : null,
      JSON.stringify(chunk.metadata)
    );
  }

  async getChunksByPath(filePath: string): Promise<MemoryChunk[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.all(
      'SELECT * FROM chunks WHERE path = ? ORDER BY start_line',
      filePath
    );

    return rows.map(row => this.rowToChunk(row));
  }

  async getAllChunks(): Promise<MemoryChunk[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.all('SELECT * FROM chunks ORDER BY path, start_line');
    return rows.map(row => this.rowToChunk(row));
  }

  async deleteChunksByPath(filePath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.run('DELETE FROM chunks WHERE path = ?', filePath);
  }

  async updateFileStatus(filePath: string, mtime: number, size: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.run(
      'INSERT OR REPLACE INTO files (path, mtime, size, indexed_at) VALUES (?, ?, ?, unixepoch())',
      filePath,
      mtime,
      size
    );
  }

  async getFileStatus(filePath: string): Promise<{ mtime: number; size: number; indexedAt: number } | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = await this.db.get('SELECT * FROM files WHERE path = ?', filePath);
    if (!row) return null;

    return {
      mtime: row.mtime,
      size: row.size,
      indexedAt: row.indexed_at,
    };
  }

  async getStats(): Promise<{ fileCount: number; chunkCount: number }> {
    if (!this.db) throw new Error('Database not initialized');

    const fileResult = await this.db.get('SELECT COUNT(*) as count FROM files');
    const chunkResult = await this.db.get('SELECT COUNT(*) as count FROM chunks');

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
      await this.db.close();
      this.db = null;
    }
  }
}

// eslint-disable-next-line
import { promises as fs } from 'node:fs';
