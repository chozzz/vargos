/** Typing indicator state management for channel adapters */

export interface TypingStateConfig {
  ttlMs?: number;
  failureLimit?: number;
}

export class TypingStateManager {
  private intervals = new Map<string, ReturnType<typeof setInterval>>();
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private failures = new Map<string, number>();

  private readonly ttlMs: number;
  private readonly failureLimit: number;

  constructor(config: TypingStateConfig = {}) {
    this.ttlMs = config.ttlMs ?? 120_000;
    this.failureLimit = config.failureLimit ?? 3;
  }

  isActive(sessionKey: string): boolean {
    return this.intervals.has(sessionKey);
  }

  /**
   * Begin (or resume) sending the indicator every 4s. Idempotent while active, so a
   * long-running tool can call it again to restart an indicator paused by the TTL.
   */
  start(sessionKey: string, callback: () => Promise<void>): void {
    if (this.intervals.has(sessionKey)) return;

    const typing = async () => {
      try {
        await callback();
        this.failures.delete(sessionKey);
      } catch {
        const failures = (this.failures.get(sessionKey) ?? 0) + 1;
        this.failures.set(sessionKey, failures);
        if (failures >= this.failureLimit) this.stop(sessionKey);
      }
    };

    void typing();
    this.intervals.set(sessionKey, setInterval(() => void typing(), 4000));
    this.timeouts.set(sessionKey, setTimeout(() => this.clearTimers(sessionKey), this.ttlMs));
  }

  stop(sessionKey: string): void {
    this.clearTimers(sessionKey);
    this.failures.delete(sessionKey);
  }

  cleanup(): void {
    for (const interval of this.intervals.values()) clearInterval(interval);
    this.intervals.clear();
    for (const timeout of this.timeouts.values()) clearTimeout(timeout);
    this.timeouts.clear();
    this.failures.clear();
  }

  /** Pause: stops sending but keeps the failure count, so `start` can resume cleanly. */
  private clearTimers(sessionKey: string): void {
    const interval = this.intervals.get(sessionKey);
    if (interval) { clearInterval(interval); this.intervals.delete(sessionKey); }
    const timeout = this.timeouts.get(sessionKey);
    if (timeout) { clearTimeout(timeout); this.timeouts.delete(sessionKey); }
  }
}
