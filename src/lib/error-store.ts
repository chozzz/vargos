/**
 * Centralized error store — append-only JSONL at ~/.vargos/errors.jsonl
 * Persists classified errors for pattern analysis and self-healing.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveDataDir } from '../config/paths.js';
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
  const filePath = path.join(resolveDataDir(), 'errors.jsonl');
  await fs.appendFile(filePath, JSON.stringify(full) + '\n', 'utf-8');
}
