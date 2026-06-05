/**
 * Pure reconnect state machine
 * Tracks attempts, computes exponential backoff delay, enforces max attempts.
 * No timers — caller owns scheduling.
 */
export interface ReconnectConfig {
    baseMs?: number;
    maxMs?: number;
    maxAttempts?: number;
}
export declare class Reconnector {
    private attempt;
    private baseMs;
    private maxMs;
    private maxAttempts;
    constructor(config?: ReconnectConfig);
    /** Returns delay in ms, or null if max attempts exhausted */
    next(): number | null;
    /** Reset after a successful connection */
    reset(): void;
    get attempts(): number;
}
//# sourceMappingURL=reconnect.d.ts.map