/**
 * Agent v2 — Bus Tools Integration
 * 
 * Converts bus callable events with @register decorators into PiAgent ToolDefinitions.
 * Each tool executes via bus.call() and returns formatted results.
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
 * Convert chars to approximate token count.
 */
export function charsToTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

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
      toolCallId: string,
      params: Record<string, unknown>,
      _onUpdate: AgentToolUpdateCallback<unknown> | undefined,
      _ctx: { cwd: string },
      _signal?: AbortSignal,
    ): Promise<AgentToolResult<unknown>> => {
      // Log tool call
      const paramsStr = Object.entries(params)
        .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 100)}`)
        .join(', ');
      log.debug(`${eventName}: ${paramsStr}`);

      try {
        // Execute via bus.call
        const result = await bus.call(eventName as never, params);

        // Convert result to text
        let resultText = '';

        if (result && typeof result === 'object') {
          resultText = JSON.stringify(result).slice(0, 2000);
        } else if (result !== undefined && result !== null) {
          resultText = String(result);
        }

        const resultTokens = charsToTokens(resultText.length);
        const preview = resultText.slice(0, 500).replace(/\n/g, ' ');
        log.debug(`${eventName} ok (${resultTokens} tokens): ${preview.slice(0, 200)}${resultText.length > 200 ? '...' : ''}`);

        // Build content with large result warning if needed
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
        
        // Store error
        appendError({ tool: eventName, sessionKey, message })
          .catch(e => log.debug(`error store: ${e}`));
        
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
 * Filters events with @register decorator that have descriptions and schemas.
 * 
 * @param sessionKey - Current session identifier for error tracking
 * @param bus - Bus instance to execute tools against
 * @returns Array of ToolDefinition for PiAgent
 */
export async function createCustomTools(sessionKey: string, bus: Bus): Promise<ToolDefinition[]> {
  // Get all registered events from bus
  const metadata = await bus.call('bus.search', {});
  
  // Filter to only tool events (callable with description and schema)
  const filtered = metadata.filter(isToolEvent);
  
  // Convert each to ToolDefinition
  return filtered.map(m =>
    wrapEventAsToolDefinition(
      m.event,
      m.description,
      (m.schema?.params as Record<string, unknown>) || {},
      sessionKey,
      bus,
    ),
  );
}
