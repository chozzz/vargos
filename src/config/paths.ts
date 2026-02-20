/**
 * Centralized path resolution for Vargos data directories
 * Single source of truth — replaces all hardcoded ~/.vargos paths
 */

import path from 'node:path';
import os from 'node:os';
import type { PathsConfig, GatewayConfig } from './pi-config.js';
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

export function resolveMediaDir(sessionKey?: string): string {
  const base = path.join(resolveDataDir(), 'media');
  return sessionKey ? path.join(base, sessionKey.replace(/:/g, '-')) : base;
}

export function resolveChannelsDir(): string {
  return path.join(resolveDataDir(), 'channels');
}

export function resolveGatewayUrl(gateway?: GatewayConfig): string {
  const host = gateway?.host ?? '127.0.0.1';
  const port = gateway?.port ?? 9000;
  return `ws://${host}:${port}`;
}

/**
 * Local cache dir for files that must live on a real filesystem (e.g. SQLite).
 * Separate from dataDir which may be on a network mount (NFS/CIFS).
 */
export function resolveCacheDir(): string {
  const xdg = process.env.XDG_CACHE_HOME?.trim();
  const base = xdg ? expandTilde(xdg) : path.join(os.homedir(), '.cache');
  return path.join(base, 'vargos');
}
