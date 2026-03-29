/**
 * Centralized error store — append-only JSONL at ~/.vargos/errors.jsonl
 * Persists classified errors for pattern analysis and self-healing.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getDataPaths } from './paths.js';
import { sanitizeError, classifyError, type ErrorClass } from './error.js';

export type ErrorStoreClass = ErrorClass | 'validation' | 'fatal';

export interface ErrorEntry {
  ts: string;
  runId?: string;
  sessionKey?: string;
  tool?: string;
  errorClass: ErrorStoreClass;
  message: string;
  model?: string;
  resolved?: boolean;
}

export async function appendError(
  entry: Omit<ErrorEntry, 'ts' | 'errorClass'> & { errorClass?: ErrorStoreClass },
): Promise<void> {
  const full: ErrorEntry = {
    ts: new Date().toISOString(),
    errorClass: entry.errorClass ?? classifyError(entry.message),
    ...entry,
    message: sanitizeError(entry.message),
  };
  const filePath = path.join(getDataPaths().dataDir, 'errors.jsonl');
  await fs.appendFile(filePath, JSON.stringify(full) + '\n', 'utf-8');
}

/** Read errors from the store, optionally filtered to the last N hours. */
export async function readErrors(opts?: { sinceHours?: number }): Promise<ErrorEntry[]> {
  const filePath = path.join(getDataPaths().dataDir, 'errors.jsonl');
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch {
    return [];
  }

  const cutoff = opts?.sinceHours
    ? new Date(Date.now() - opts.sinceHours * 3600_000).toISOString()
    : undefined;

  const entries: ErrorEntry[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as ErrorEntry;
      if (cutoff && entry.ts < cutoff) continue;
      entries.push(entry);
    } catch { /* skip malformed lines */ }
  }
  return entries;
}
