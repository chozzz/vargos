/**
 * Centralized path resolution for Vargos data directories
 * Single source of truth — replaces all hardcoded ~/.vargos paths
 */

import path from 'node:path';
import os from 'node:os';
import type { PathsConfig } from './pi-config.js';
import { expandTilde } from '../lib/path.js';

let cachedPaths: { dataDir: string; workspace: string } | null = null;

/**
 * Lock in resolved paths from config — called once at boot after config load.
 * Falls back to env/defaults for any unset field.
 */
export function initPaths(config?: PathsConfig): void {
  const dataDir = config?.dataDir
    ? expandTilde(config.dataDir)
    : (process.env.VARGOS_DATA_DIR?.trim() ? expandTilde(process.env.VARGOS_DATA_DIR.trim()) : path.join(os.homedir(), '.vargos'));

  const workspace = config?.workspace
    ? expandTilde(config.workspace)
    : path.join(dataDir, 'workspace');

  cachedPaths = { dataDir, workspace };
}

/** Reset cached paths — for testing only */
export function resetPaths(): void {
  cachedPaths = null;
}

export function resolveDataDir(): string {
  if (cachedPaths) return cachedPaths.dataDir;
  const env = process.env.VARGOS_DATA_DIR?.trim();
  return env ? expandTilde(env) : path.join(os.homedir(), '.vargos');
}

export function resolveWorkspaceDir(): string {
  if (cachedPaths) return cachedPaths.workspace;
  return path.join(resolveDataDir(), 'workspace');
}

export function resolveSessionsDir(): string {
  return path.join(resolveDataDir(), 'sessions');
}

export function resolveSessionFile(sessionKey: string): string {
  return path.join(resolveSessionsDir(), `${sessionKey.replace(/:/g, '-')}.jsonl`);
}

export function resolveMediaDir(sessionKey?: string): string {
  const base = path.join(resolveDataDir(), 'media');
  return sessionKey ? path.join(base, sessionKey.replace(/:/g, '-')) : base;
}

export function resolveChannelsDir(): string {
  return path.join(resolveDataDir(), 'channels');
}
