/**
 * Pure reconnect state machine
 * Tracks attempts, computes exponential backoff delay, enforces max attempts.
 * No timers — caller owns scheduling.
 */
export class Reconnector {
    attempt = 0;
    baseMs;
    maxMs;
    maxAttempts;
    constructor(config = {}) {
        this.baseMs = config.baseMs ?? 2000;
        this.maxMs = config.maxMs ?? 60_000;
        this.maxAttempts = config.maxAttempts ?? 10;
    }
    /** Returns delay in ms, or null if max attempts exhausted */
    next() {
        if (this.attempt >= this.maxAttempts)
            return null;
        const delay = Math.min(this.baseMs * 2 ** this.attempt, this.maxMs);
        this.attempt++;
        return delay;
    }
    /** Reset after a successful connection */
    reset() {
        this.attempt = 0;
    }
    get attempts() {
        return this.attempt;
    }
}
//# sourceMappingURL=reconnect.js.map