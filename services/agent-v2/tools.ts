/**
 * Agent v2 — Bus Tools Integration
 * 
 * Converts bus callable events with @register decorators into PiAgent ToolDefinitions.
 */

import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { AgentToolResult, AgentToolUpdateCallback } from '@mariozechner/pi-agent-core';
import type { Bus } from '../../gateway/bus.js';
import { createLogger } from '../../lib/logger.js';
import { isToolEvent } from '../../gateway/emitter.js';
import { toMessage } from '../../lib/error.js';
import { appendError } from '../../lib/error-store.js';

const log = createLogger('agent-v2-tools');

const LARGE_RESULT_TOKEN_THRESHOLD = 5_000;

/**
 * Wrap a bus event as a PiAgent ToolDefinition.
 */
function wrapEventAsToolDefinition(
  eventName: string,
  description: string,
  parameters: Record<string, unknown>,
  sessionKey: string,
  bus: Bus,
): ToolDefinition {
  return {
    name: eventName,
    label: eventName,
    description,
    parameters: parameters as ToolDefinition['parameters'],
    execute: async (
      _toolCallId: string,
      params: Record<string, unknown>,
      _onUpdate: AgentToolUpdateCallback<unknown> | undefined,
      _ctx: { cwd: string },
      _signal?: AbortSignal,
    ): Promise<AgentToolResult<unknown>> => {
      log.debug(`${eventName}: ${Object.entries(params).map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 100)}`).join(', ')}`);

      try {
        const result = await bus.call(eventName as never, params);

        let resultText = '';
        if (result && typeof result === 'object') {
          resultText = JSON.stringify(result).slice(0, 2000);
        } else if (result !== undefined && result !== null) {
          resultText = String(result);
        }

        const resultTokens = Math.ceil(resultText.length / 4);
        log.debug(`${eventName} ok (${resultTokens} tokens): ${resultText.slice(0, 200).replace(/\n/g, ' ')}${resultText.length > 200 ? '...' : ''}`);

        const content = [{ type: 'text' as const, text: resultText }];

        if (resultTokens > LARGE_RESULT_TOKEN_THRESHOLD) {
          const warning = `⚠ Large tool response (~${(resultTokens / 1000).toFixed(1)}k tokens). Extract what you need and avoid additional large calls.\n\n`;
          content[0] = { type: 'text' as const, text: warning + content[0].text };
          log.info(`${eventName}: large result warning (${resultTokens} tokens)`);
        }

        return { content, details: {} };
      } catch (err) {
        const message = toMessage(err);
        log.debug(`${eventName} error: ${message}`);
        appendError({ tool: eventName, sessionKey, message }).catch(() => {});
        return {
          content: [{ type: 'text' as const, text: `Error: ${message}` }],
          details: { error: message },
        };
      }
    },
  };
}

/**
 * Create PiAgent custom tools from bus callable events.
 */
export async function createCustomTools(sessionKey: string, bus: Bus): Promise<ToolDefinition[]> {
  const metadata = await bus.call('bus.search', {});
  return metadata.filter(isToolEvent).map(m =>
    wrapEventAsToolDefinition(m.event, m.description, (m.schema?.params as Record<string, unknown>) || {}, sessionKey, bus),
  );
}
