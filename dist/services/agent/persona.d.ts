export interface PersonaMeta {
    /** Glob whitelist of customTools the channel agent can call. Empty/missing = all customTools allowed. */
    allowedTools?: string[];
}
export interface Persona {
    meta: PersonaMeta;
    body: string;
}
/**
 * Load persona for `channelId` from `~/.vargos/agents/<channelId>.md`. Re-reads from disk on
 * every call (no in-memory cache). Returns null when the file is missing, totally empty,
 * or has neither frontmatter nor body content.
 */
export declare function loadChannelPersona(channelId: string): Promise<Persona | null>;
/**
 * Load the subagent persona from `~/.vargos/agents/subagent.md`.
 * Seeded from `.templates/agents/subagent.md` on startup (copy-missing).
 * Returns null if the file is missing or empty.
 */
export declare function loadSubagentPersona(): Promise<Persona | null>;
//# sourceMappingURL=persona.d.ts.map