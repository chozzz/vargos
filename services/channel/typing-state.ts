/** Typing indicator state management for channel adapters */

export interface TypingStateConfig {
  ttlMs?: number;
  failureLimit?: number;
}

export class TypingStateManager {
  private intervals = new Map<string, ReturnType<typeof setInterval>>();
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private failures = new Map<string, number>();
  private inToolExecution = new Set<string>();

  private readonly ttlMs: number;
  private readonly failureLimit: number;

  constructor(config: TypingStateConfig = {}) {
    this.ttlMs = config.ttlMs ?? 120_000;
    this.failureLimit = config.failureLimit ?? 3;
  }

  isActive(sessionKey: string): boolean {
    return this.intervals.has(sessionKey);
  }

  isInToolExecution(sessionKey: string): boolean {
    return this.inToolExecution.has(sessionKey);
  }

  start(sessionKey: string, callback: () => Promise<void>, inToolExecution = false): void {
    if (this.intervals.has(sessionKey)) return;

    if (inToolExecution) {
      this.inToolExecution.add(sessionKey);
    }

    const typing = async () => {
      try {
        await callback();
        this.failures.delete(sessionKey);
      } catch {
        const failures = (this.failures.get(sessionKey) ?? 0) + 1;
        this.failures.set(sessionKey, failures);
        if (failures >= this.failureLimit) {
          this.stop(sessionKey, true);
        }
      }
    };

    void typing();
    this.intervals.set(sessionKey, setInterval(() => void typing(), 4000));
    this.timeouts.set(
      sessionKey,
      setTimeout(() => {
        this.pause(sessionKey);
      }, this.ttlMs),
    );
  }

  pause(sessionKey: string): void {
    const interval = this.intervals.get(sessionKey);
    if (interval) { clearInterval(interval); this.intervals.delete(sessionKey); }
    const timeout = this.timeouts.get(sessionKey);
    if (timeout) { clearTimeout(timeout); this.timeouts.delete(sessionKey); }
  }

  resume(sessionKey: string, callback: () => Promise<void>): void {
    if (!this.inToolExecution.has(sessionKey)) return;
    this.start(sessionKey, callback, true);
  }

  stop(sessionKey: string, final = true): void {
    const interval = this.intervals.get(sessionKey);
    if (interval) { clearInterval(interval); this.intervals.delete(sessionKey); }
    const timeout = this.timeouts.get(sessionKey);
    if (timeout) { clearTimeout(timeout); this.timeouts.delete(sessionKey); }

    if (final) {
      this.failures.delete(sessionKey);
      this.inToolExecution.delete(sessionKey);
    }
  }

  cleanup(): void {
    for (const interval of this.intervals.values()) clearInterval(interval);
    this.intervals.clear();
    for (const timeout of this.timeouts.values()) clearTimeout(timeout);
    this.timeouts.clear();
    this.failures.clear();
    this.inToolExecution.clear();
  }
}
