/**
 * Centralized error store — append-only JSONL at ~/.vargos/errors.jsonl
 * Persists classified errors for pattern analysis and self-healing.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getDataPaths } from './paths.js';
import { sanitizeError, classifyError, type ErrorClass } from './error.js';

export interface ErrorEntry {
  ts: string;
  runId?: string;
  sessionKey?: string;
  tool?: string;
  errorClass: ErrorClass | 'validation' | 'fatal';
  message: string;
  model?: string;
  resolved?: boolean;
}

export async function appendError(
  entry: Omit<ErrorEntry, 'ts' | 'errorClass'> & { errorClass?: ErrorClass | 'validation' | 'fatal' },
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
