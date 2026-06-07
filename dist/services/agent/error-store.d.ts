/**
 * Centralized error store — append-only JSONL at ~/.vargos/errors.jsonl
 * Persists classified errors for pattern analysis and self-healing.
 */
import { type ErrorClass } from '../../lib/error.js';
export interface ErrorRecord {
    ts: string;
    runId?: string;
    sessionKey?: string;
    tool?: string;
    errorClass: ErrorClass | 'validation' | 'fatal';
    message: string;
    model?: string;
    resolved?: boolean;
}
export declare function appendError(entry: Omit<ErrorRecord, 'ts' | 'errorClass'> & {
    errorClass?: ErrorClass | 'validation' | 'fatal';
}): Promise<void>;
//# sourceMappingURL=error-store.d.ts.map