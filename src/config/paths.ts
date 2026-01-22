/**
 * Centralized path resolution for Vargos data directories
 * Single source of truth — replaces all hardcoded ~/.vargos paths
 */

import path from 'node:path';
import os from 'node:os';

/** Expand leading ~ to homedir (shell doesn't expand inside .env values) */
function expandTilde(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function resolveDataDir(): string {
  const env = process.env.VARGOS_DATA_DIR?.trim();
  return env ? expandTilde(env) : path.join(os.homedir(), '.vargos');
}

export function resolveWorkspaceDir(): string {
  const env = process.env.VARGOS_WORKSPACE?.trim();
  return env ? expandTilde(env) : path.join(resolveDataDir(), 'workspace');
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

export function resolveChannelConfigFile(): string {
  return path.join(resolveDataDir(), 'channels.json');
}
