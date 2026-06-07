/**
 * Status reaction controller
 * Maps agent phases to emoji reactions on the triggering message.
 * Debounces transient states (thinking, tool) and seals on terminal ones (done, error).
 */
export type ReactionPhase = 'queued' | 'thinking' | 'tool' | 'done' | 'error';
export interface ReactionAdapter {
    react(recipientId: string, messageId: string, emoji: string): Promise<void>;
}
export declare class StatusReactionController {
    private readonly adapter;
    private readonly recipientId;
    private readonly messageId;
    private sealed;
    private debounceTimer;
    private chain;
    constructor(adapter: ReactionAdapter, recipientId: string, messageId: string);
    setThinking(): void;
    setTool(): void;
    setDone(): void;
    setError(): void;
    dispose(): void;
    private debounced;
    private immediate;
    private enqueue;
}
//# sourceMappingURL=status-reactions.d.ts.map