import Database from 'better-sqlite3';
import path from 'node:path';
import { promises as fs } from 'node:fs';
export class MemorySQLiteStorage {
    dbPath;
    db = null;
    constructor(dbPath) {
        this.dbPath = dbPath;
    }
    async initialize() {
        await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = DELETE');
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
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        mtime INTEGER NOT NULL,
        size INTEGER NOT NULL,
        indexed_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);
    }
    async saveChunk(chunk) {
        this.db.prepare(`INSERT OR REPLACE INTO chunks (id, path, content, start_line, end_line, embedding, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`).run(chunk.id, chunk.path, chunk.content, chunk.startLine, chunk.endLine, chunk.embedding ? JSON.stringify(chunk.embedding) : null, JSON.stringify(chunk.metadata));
    }
    async getAllChunks() {
        const rows = this.db.prepare('SELECT * FROM chunks ORDER BY path, start_line').all();
        return rows.map(r => this.rowToChunk(r));
    }
    async deleteChunksByPath(filePath) {
        this.db.prepare('DELETE FROM chunks WHERE path = ?').run(filePath);
    }
    async updateFileStatus(filePath, mtime, size) {
        this.db.prepare('INSERT OR REPLACE INTO files (path, mtime, size, indexed_at) VALUES (?, ?, ?, unixepoch())').run(filePath, mtime, size);
    }
    async getFileStatus(filePath) {
        const row = this.db.prepare('SELECT * FROM files WHERE path = ?').get(filePath);
        if (!row)
            return null;
        return { mtime: row.mtime, size: row.size, indexedAt: row.indexed_at };
    }
    async getStats() {
        const f = this.db.prepare('SELECT COUNT(*) as count FROM files').get();
        const c = this.db.prepare('SELECT COUNT(*) as count FROM chunks').get();
        return { fileCount: f?.count ?? 0, chunkCount: c?.count ?? 0 };
    }
    async close() {
        this.db?.close();
        this.db = null;
    }
    rowToChunk(row) {
        return {
            id: row.id,
            path: row.path,
            content: row.content,
            startLine: row.start_line,
            endLine: row.end_line,
            embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
            metadata: row.metadata ? JSON.parse(row.metadata) : {},
        };
    }
}
//# sourceMappingURL=sqlite-storage.js.map