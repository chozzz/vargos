export declare function cronSessionKey(taskId: string): string;
export declare function webhookSessionKey(hookId: string): string;
/**
 * Generate a unique subagent session key from the parent key.
 * Appends `:subagent:<shortId>` so each delegation gets its own session,
 * enabling parallel subagents without collision.
 */
export declare function subagentSessionKey(parentKey: string): string;
/** Check if a sessionKey belongs to any subagent (any depth). */
export declare function isSubagentSession(key: string): boolean;
/** Extract the root parent sessionKey by stripping all subagent suffixes. */
export declare function rootSessionKey(key: string): string;
export declare function parseSessionKey(key: string): {
    type: string;
    id: string;
};
export declare function parseChannelTarget(target: string): {
    channel: string;
    userId: string;
} | null;
//# sourceMappingURL=session-key.d.ts.map