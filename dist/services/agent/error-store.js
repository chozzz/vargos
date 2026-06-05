/**
 * Centralized error store — append-only JSONL at ~/.vargos/errors.jsonl
 * Persists classified errors for pattern analysis and self-healing.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getDataPaths } from '../../lib/paths.js';
import { sanitizeError, classifyError } from '../../lib/error.js';
export async function appendError(entry) {
    const full = {
        ts: new Date().toISOString(),
        errorClass: entry.errorClass ?? classifyError(entry.message),
        ...entry,
        message: sanitizeError(entry.message),
    };
    const filePath = path.join(getDataPaths().dataDir, 'errors.jsonl');
    await fs.appendFile(filePath, JSON.stringify(full) + '\n', 'utf-8');
}
//# sourceMappingURL=error-store.js.map