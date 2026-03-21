/**
 * Cross-machine gateway lock using a plain JSON file + heartbeat
 * Works over shared filesystems (NFS, CIFS, SSHFS) where SQLite and PID checks fail
 */

import path from 'node:path';
import os from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
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

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lockPath = '';

function readLock(filePath: string): LockInfo | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as LockInfo;
  } catch {
    return null;
  }
}

function writeLock(filePath: string, info: LockInfo): void {
  writeFileSync(filePath, JSON.stringify(info));
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function acquireLock(dataDir: string): Promise<LockInfo | null> {
  await fs.mkdir(dataDir, { recursive: true });
  lockPath = path.join(dataDir, LOCK_FILE);

  const existing = readLock(lockPath);

  if (existing) {
    const age = Date.now() - existing.heartbeat;
    const sameHost = existing.host === os.hostname();
    const localAlive = sameHost && isProcessAlive(existing.pid);

    if (age < STALE_THRESHOLD_MS && !sameHost) {
      // Another host has an active lock
      return existing;
    }

    if (localAlive && existing.pid !== process.pid) {
      // Same host, different live process
      return existing;
    }
    // Otherwise stale — we can take over
  }

  // Acquire
  const now = Date.now();
  const info: LockInfo = {
    host: os.hostname(),
    pid: process.pid,
    startedAt: now,
    heartbeat: now,
  };
  writeLock(lockPath, info);

  // Start heartbeat
  heartbeatTimer = setInterval(() => {
    try {
      writeLock(lockPath, { ...info, heartbeat: Date.now() });
    } catch { /* file gone during shutdown */ }
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
    await fs.unlink(lockPath);
  } catch { /* already gone */ }
}
