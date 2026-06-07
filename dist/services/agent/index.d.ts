/**
 * Agent — PiAgent-powered runtime
 *
 * Features:
 * - PiAgent session persistence
 * - PiAgent ResourceLoader for skills/prompts
 * - Debug mode for inspecting tools, prompts, history
 * - Streaming events passthrough to bus (agent.onDelta, agent.onTool, agent.onCompleted)
 */
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import type { AppConfig } from '../../services/config/index.js';
import type { AgentDeps } from './types.js';
import { SettingsManager, AuthStorage, ModelRegistry, DefaultResourceLoader, type AgentSession, type ToolDefinition } from '@earendil-works/pi-coding-agent';
export declare class AgentService {
    protected bus: Bus;
    protected config: AppConfig;
    protected sessions: Map<string, AgentSession>;
    private activeRuns;
    protected agentDir: string;
    protected authStorage: AuthStorage;
    protected modelRegistry: ModelRegistry;
    protected settings: SettingsManager;
    constructor(deps: AgentDeps);
    /**
     * Persist retry settings to disk during boot
     */
    start(): Promise<void>;
    /**
     * agent.execute — Run a task
     *
     * Note: sessionKey is declared optional here because it's auto-injected by
     * wrapEventAsToolDefinition() when the agent calls this as a tool. Direct callers
     * (channels, cron, webhooks, TCP) still provide sessionKey via EventMap.
     */
    execute(params: EventMap['agent.execute']['params']): Promise<EventMap['agent.execute']['result']>;
    /**
     * agent.appendMessage — Append message to session JSONL without executing agent.
     * Records inbound messages in session history (observe-only for non-whitelisted).
     * Internal only — not exposed as an agent tool.
     */
    appendMessage(params: EventMap['agent.appendMessage']['params']): Promise<void>;
    /**
     * agent.status — Return currently active agent session keys.
     */
    status(_params: EventMap['agent.status']['params']): Promise<EventMap['agent.status']['result']>;
    /**
     * Get or create AgentSession for sessionKey.
     * Uses SessionManager.continueRecent() to load the latest session file,
     * preserving conversation history across restarts.
     */
    protected getOrCreateSession(sessionKey: string, options?: {
        cwd?: string;
        model?: string;
    }): Promise<AgentSession>;
    /**
     * Subscribe to PiAgent sessionsubscription - emit to bus for streaming + debug logging.
     */
    protected subscribeToSessionEvents(session: AgentSession, sessionKey: string): void;
    /**
     * Create ResourceLoader. PiAgent's DefaultResourceLoader handles skills, themes, and
     * prompt templates. We override systemPrompt with our Vargos bootstrap files.
     */
    protected createResourceLoader(systemPromptOverride?: string, cwd?: string): Promise<DefaultResourceLoader>;
    /**
     * Load persona for the given sessionKey.
     * - Subagent sessions: load `agents/subagent.md` (preamble + allowedTools whitelist).
     * - Channel sessions: load `agents/<channelId>.md` (persona + tool filter).
     * - Cron / CLI / other types: return null (no persona override applied).
     */
    private loadPersonaIfChannel;
    /**
     * Build system prompt.
     * - Subagent sessions: return the persona body from `agents/subagent.md`.
     *   No bootstrap files (AGENTS.md, SOUL.md, TOOLS.md) are loaded — the parent's
     *   task description is the subagent's sole context.
     * - Parent/other sessions: merge AGENTS.md + SOUL.md + TOOLS.md from workspace/cwd,
     *   then append channel persona body if provided.
     */
    private getSystemPrompt;
    /**
     * Load custom tools from bus callable events. When `allowedPatterns` is provided
     * (from a channel persona), filter the tool list down to names matching at least
     * one glob pattern. Empty/undefined patterns = all tools allowed.
     */
    protected getCustomTools(sessionKey: string, allowedPatterns?: string[]): Promise<ToolDefinition[]>;
    /**
     * Validate model override if provided.
     */
    private isValidModel;
    /**
     * Extract the final assistant message: text content + error (when stopReason === 'error').
     * Pi SDK records inference failures (e.g. missing API key) as assistant messages with
     * empty content and `errorMessage` populated, instead of throwing — without inspecting
     * `stopReason`/`errorMessage` here, those would surface as silent empty completions.
     */
    private extractFinalAssistant;
    stop(): void;
}
export declare function boot(bus: Bus): Promise<{
    stop(): void;
}>;
//# sourceMappingURL=index.d.ts.map