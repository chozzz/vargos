/**
 * Vargos Pi SDK Extension
 * Builds ToolDefinitions from bus.search() — filters callable events with descriptions
 */

import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { AgentToolResult, AgentToolUpdateCallback } from '@mariozechner/pi-agent-core';
import type { Bus } from '../../gateway/bus.js';
import { createLogger } from '../../lib/logger.js';
import { isToolEvent } from '../../gateway/emitter.js';
import { toMessage } from '../../lib/error.js';
import { appendError } from '../../lib/error-store.js';
import { appendToolResult, charsToTokens } from '../../lib/tool-store.js';

const log = createLogger('tools');

const LARGE_RESULT_TOKEN_THRESHOLD = 5_000;

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
      const paramsStr = Object.entries(params)
        .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 100)}`).join(', ');
      log.debug(`${eventName}: ${paramsStr}`);

      try {
        const result = await bus.call(eventName as never, params);

        // Convert result to ToolResult format
        let resultText = '';
        let isError = false;

        if (result && typeof result === 'object') {
          resultText = JSON.stringify(result).slice(0, 2000);
        } else {
          resultText = String(result);
        }

        const resultTokens = charsToTokens(resultText.length);
        const preview = resultText.slice(0, 500).replace(/\n/g, ' ');
        log.debug(`${eventName} ok (${resultTokens} tokens): ${preview.slice(0, 200)}${resultText.length > 200 ? '...' : ''}`);
        appendToolResult({
          ts: new Date().toISOString(), toolCallId, sessionKey,
          tool: eventName, args: params, resultChars: resultText.length,
          isError, preview: resultText.slice(0, 500).replace(/\n/g, ' '),
        }).catch(e => log.debug(`tool store: ${e}`));

        const content = [{ type: 'text' as const, text: resultText }];

        if (resultTokens > LARGE_RESULT_TOKEN_THRESHOLD && content.length > 0) {
          const warning = `⚠ Large tool response (~${(resultTokens / 1000).toFixed(1)}k tokens). Extract what you need and avoid additional large calls.\n\n`;
          content[0] = { type: 'text' as const, text: warning + content[0].text };
          log.info(`${eventName}: large result warning (${resultTokens} tokens)`);
        }

        return { content, details: {} };
      } catch (err) {
        const message = toMessage(err);
        log.debug(`${eventName} error: ${message}`);
        appendError({ tool: eventName, sessionKey, message })
          .catch(e => log.debug(`error store: ${e}`));
        appendToolResult({
          ts: new Date().toISOString(), toolCallId, sessionKey,
          tool: eventName, args: params, resultChars: message.length,
          isError: true, preview: message.slice(0, 500).replace(/\n/g, ' '),
        }).catch(e => log.debug(`tool store: ${e}`));
        return {
          content: [{ type: 'text', text: `Error: ${message}` }],
          details: { error: message },
        };
      }
    },
  };
}

export async function createVargosCustomTools(sessionKey: string, bus: Bus): Promise<ToolDefinition[]> {
  const metadata = await bus.call('bus.search', {});
  const filtered = metadata.filter(isToolEvent);

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
