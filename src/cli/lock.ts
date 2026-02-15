/**
 * Cross-machine gateway lock using SQLite heartbeat
 * Works over shared filesystems (NFS, CIFS, SSHFS) where PID checks fail
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

const LOCK_FILE = 'gateway.lock';
const HEARTBEAT_INTERVAL_MS = 10_000;
const STALE_THRESHOLD_MS = 30_000;

export interface LockInfo {
  host: string;
  pid: number;
  startedAt: number;
  heartbeat: number;
}

let db: InstanceType<typeof Database> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function openLockDb(dataDir: string): InstanceType<typeof Database> {
  const lockPath = path.join(dataDir, LOCK_FILE);
  const conn = new Database(lockPath);
  // DELETE mode — WAL requires mmap which breaks on network filesystems (NFS/CIFS)
  conn.pragma('journal_mode = DELETE');
  conn.exec(`
    CREATE TABLE IF NOT EXISTS lock (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      host TEXT NOT NULL,
      pid INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      heartbeat INTEGER NOT NULL
    )
  `);
  return conn;
}

export async function acquireLock(dataDir: string): Promise<LockInfo | null> {
  await fs.mkdir(dataDir, { recursive: true });
  db = openLockDb(dataDir);

  const row = db.prepare('SELECT host, pid, started_at, heartbeat FROM lock WHERE id = 1').get() as
    | { host: string; pid: number; started_at: number; heartbeat: number }
    | undefined;

  if (row) {
    const age = Date.now() - row.heartbeat;
    const sameHost = row.host === os.hostname();
    const localAlive = sameHost && isProcessAlive(row.pid);

    if (age < STALE_THRESHOLD_MS && !sameHost) {
      // Another host has an active lock
      db.close();
      db = null;
      return { host: row.host, pid: row.pid, startedAt: row.started_at, heartbeat: row.heartbeat };
    }

    if (localAlive && row.pid !== process.pid) {
      // Same host, different live process
      db.close();
      db = null;
      return { host: row.host, pid: row.pid, startedAt: row.started_at, heartbeat: row.heartbeat };
    }
  }

  // Acquire: upsert our lock
  const now = Date.now();
  db.prepare(
    'INSERT OR REPLACE INTO lock (id, host, pid, started_at, heartbeat) VALUES (1, ?, ?, ?, ?)',
  ).run(os.hostname(), process.pid, now, now);

  // Start heartbeat
  heartbeatTimer = setInterval(() => {
    try {
      db?.prepare('UPDATE lock SET heartbeat = ? WHERE id = 1').run(Date.now());
    } catch { /* db closed during shutdown */ }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref();

  return null;
}

export async function releaseLock(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  try {
    db?.prepare('DELETE FROM lock WHERE id = 1').run();
    db?.close();
  } catch { /* already gone */ }
  db = null;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
