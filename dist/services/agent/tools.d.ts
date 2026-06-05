/**
 * Agent — Bus Tools Integration
 *
 * Converts bus callable events with @register decorators into PiAgent ToolDefinitions.
 *
 * Session key injection:
 * - Every tool closes over the parent sessionKey from getCustomTools().
 * - For agent.execute specifically, a unique `:subagent:<id>` suffix is generated
 *   so each delegation gets its own isolated session (supports parallel subagents).
 * - Other tools inherit the parent sessionKey for context-aware operations.
 *
 * Subagent tool filtering:
 * - Controlled by the `allowedTools` glob whitelist in `agents/subagent.md` frontmatter.
 * - Applied by `AgentService.getCustomTools()` via `matchesGlob` — not enforced here.
 *
 * Schema vs EventMap gap:
 * - The agent.execute schema omits sessionKey (it's injected here before bus.call).
 * - EventMap['agent.execute']['params'] still declares sessionKey as required because
 *   direct callers (channels, cron, webhooks, TCP clients) must provide it.
 * - This mismatch is intentional — the tool wrapper is the bridge between the agent's
 *   view (no sessionKey) and the service's view (sessionKey required).
 */
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { Bus } from '../../gateway/bus.js';
/**
 * Create PiAgent custom tools from bus callable events.
 *
 * Subagent tool filtering (agent.execute, channel.send, etc.) is handled by the
 * `allowedTools` glob whitelist in `agents/subagent.md` frontmatter, applied
 * by `AgentService.getCustomTools()` via `matchesGlob`.
 */
export declare function createCustomTools(sessionKey: string, bus: Bus): Promise<ToolDefinition[]>;
//# sourceMappingURL=tools.d.ts.map