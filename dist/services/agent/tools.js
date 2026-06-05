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
import { createLogger } from '../../lib/logger.js';
import { isToolEvent } from '../../gateway/emitter.js';
import { toMessage } from '../../lib/error.js';
import { appendError } from './error-store.js';
import { subagentSessionKey } from '../../lib/session-key.js';
const log = createLogger('agent-tools');
const LARGE_RESULT_TOKEN_THRESHOLD = 5_000;
/**
 * Wrap a bus event as a PiAgent ToolDefinition.
 */
function wrapEventAsToolDefinition(eventName, description, parameters, sessionKey, bus) {
    // Sanitize tool name for anthropic: replace dots with dashes (e.g., agent.execute → agent-execute)
    const sanitizedName = eventName.replace(/\./g, '-');
    return {
        name: sanitizedName,
        label: eventName,
        description,
        parameters: parameters,
        execute: async (_toolCallId, params, _signal, _onUpdate, 
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _ctx) => {
            const paramsObj = params;
            log.debug(`${eventName}: ${Object.entries(paramsObj).map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 100)}`).join(', ')}`);
            try {
                // Auto-inject sessionKey for agent.execute subagent calls.
                // Each delegation gets a unique session key to support parallel subagents.
                if (eventName === 'agent.execute') {
                    paramsObj.sessionKey = subagentSessionKey(sessionKey);
                }
                // Auto-inject sessionKey for channel.send if not provided.
                // Allows the agent to call channel-send without knowing its own sessionKey.
                if (eventName === 'channel.send' && !paramsObj.sessionKey) {
                    paramsObj.sessionKey = sessionKey;
                }
                const result = await bus.call(eventName, paramsObj);
                let resultText = '';
                if (result && typeof result === 'object') {
                    resultText = JSON.stringify(result).slice(0, 10_000);
                }
                else if (result !== undefined && result !== null) {
                    resultText = String(result).slice(0, 10_000);
                }
                // Head+tail truncation for large results (preserves start and end, drops middle).
                const MAX_RESULT_CHARS = 20_000;
                if (resultText.length > MAX_RESULT_CHARS) {
                    const head = Math.floor(MAX_RESULT_CHARS * 0.7);
                    const tail = Math.floor(MAX_RESULT_CHARS * 0.2);
                    resultText = `${resultText.slice(0, head)}\n\n[…truncated ${resultText.length - head - tail} chars…]\n\n${resultText.slice(-tail)}`;
                }
                const resultTokens = Math.ceil(resultText.length / 4);
                log.debug(`${eventName} ok (${resultTokens} tokens): ${resultText.slice(0, 200).replace(/\n/g, ' ')}${resultText.length > 200 ? '...' : ''}`);
                const content = [{ type: 'text', text: resultText }];
                if (resultTokens > LARGE_RESULT_TOKEN_THRESHOLD) {
                    const warning = `⚠ Large tool response (~${(resultTokens / 1000).toFixed(1)}k tokens). Extract what you need and avoid additional large calls.\n\n`;
                    content[0] = { type: 'text', text: warning + content[0].text };
                    log.info(`${eventName}: large result warning (${resultTokens} tokens)`);
                }
                return { content, details: {} };
            }
            catch (err) {
                const message = toMessage(err);
                log.debug(`${eventName} error: ${message}`);
                appendError({ tool: eventName, sessionKey, message }).catch(() => { });
                return {
                    content: [{ type: 'text', text: `Error: ${message}` }],
                    details: { error: message },
                };
            }
        },
    };
}
/**
 * Create PiAgent custom tools from bus callable events.
 *
 * Subagent tool filtering (agent.execute, channel.send, etc.) is handled by the
 * `allowedTools` glob whitelist in `agents/subagent.md` frontmatter, applied
 * by `AgentService.getCustomTools()` via `matchesGlob`.
 */
export async function createCustomTools(sessionKey, bus) {
    const metadata = await bus.call('bus.search', {});
    return metadata
        .filter(isToolEvent)
        .map(m => wrapEventAsToolDefinition(m.event, m.description, m.schema?.params || {}, sessionKey, bus));
}
//# sourceMappingURL=tools.js.map