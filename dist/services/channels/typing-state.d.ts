/** Typing indicator state management for channel adapters */
export interface TypingStateConfig {
    ttlMs?: number;
    failureLimit?: number;
}
export declare class TypingStateManager {
    private intervals;
    private timeouts;
    private failures;
    private inToolExecution;
    private readonly ttlMs;
    private readonly failureLimit;
    constructor(config?: TypingStateConfig);
    isActive(sessionKey: string): boolean;
    isInToolExecution(sessionKey: string): boolean;
    start(sessionKey: string, callback: () => Promise<void>, inToolExecution?: boolean): void;
    pause(sessionKey: string): void;
    resume(sessionKey: string, callback: () => Promise<void>): void;
    stop(sessionKey: string, final?: boolean): void;
    cleanup(): void;
}
//# sourceMappingURL=typing-state.d.ts.map