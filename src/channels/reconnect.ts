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

export class Reconnector {
  private attempt = 0;
  private baseMs: number;
  private maxMs: number;
  private maxAttempts: number;

  constructor(config: ReconnectConfig = {}) {
    this.baseMs = config.baseMs ?? 2000;
    this.maxMs = config.maxMs ?? 60_000;
    this.maxAttempts = config.maxAttempts ?? 10;
  }

  /** Returns delay in ms, or null if max attempts exhausted */
  next(): number | null {
    if (this.attempt >= this.maxAttempts) return null;
    const delay = Math.min(this.baseMs * 2 ** this.attempt, this.maxMs);
    this.attempt++;
    return delay;
  }

  /** Reset after a successful connection */
  reset(): void {
    this.attempt = 0;
  }

  get attempts(): number {
    return this.attempt;
  }
}
