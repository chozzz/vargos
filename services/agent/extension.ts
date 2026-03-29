/**
 * Vargos Pi SDK Extension
 * Wraps Vargos tools into Pi SDK ToolDefinition format
 */

import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { AgentToolResult, AgentToolUpdateCallback } from '@mariozechner/pi-agent-core';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { toolRegistry } from '../tools/registry.js';
import type { Tool, ToolContext } from '../tools/types.js';
import type { Bus } from '../../gateway/bus.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { appendError } from '../../lib/error-store.js';
import { appendToolResult, charsToTokens } from '../../lib/tool-store.js';

const log = createLogger('tools');

const LARGE_RESULT_TOKEN_THRESHOLD = 5_000;

function createParamsSchema(zodSchema: import('zod').ZodSchema): ToolDefinition['parameters'] {
  const jsonSchema = zodToJsonSchema(zodSchema, { name: 'parameters', $refStrategy: 'none' });
  return (jsonSchema.definitions?.parameters || jsonSchema) as ToolDefinition['parameters'];
}

function wrapVargosTool(tool: Tool, workingDir: string, sessionKey: string, bus: Bus): ToolDefinition {
  const parameters = tool.jsonSchema
    ? (tool.jsonSchema as ToolDefinition['parameters'])
    : createParamsSchema(tool.parameters);

  const storeResult = (
    toolCallId: string, sk: string, toolName: string,
    args: Record<string, unknown>, text: string, isError: boolean,
  ) => appendToolResult({
    ts: new Date().toISOString(), toolCallId, sessionKey: sk,
    tool: toolName, args, resultChars: text.length,
    isError, preview: text.slice(0, 500).replace(/\n/g, ' '),
  }).catch(e => log.debug(`tool store: ${e}`));

  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters,
    execute: async (
      toolCallId: string,
      params: Record<string, unknown>,
      _onUpdate: AgentToolUpdateCallback<unknown> | undefined,
      _ctx: { cwd: string },
      _signal?: AbortSignal,
    ): Promise<AgentToolResult<unknown>> => {
      const toolContext: ToolContext = { sessionKey, workingDir, bus };

      const paramsStr = Object.entries(params)
        .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 100)}`).join(', ');
      log.debug(`${tool.name}: ${paramsStr}`);

      try {
        const result = await tool.execute(params, toolContext);

        const resultText = result.content.map(c => c.type === 'text' ? c.text : `[${c.type}]`).join(' ');
        const resultTokens = charsToTokens(resultText.length);
        const preview = resultText.slice(0, 500).replace(/\n/g, ' ');
        log.debug(`${tool.name} ${result.isError ? 'err' : 'ok'} (${resultTokens} tokens): ${preview.slice(0, 200)}${resultText.length > 200 ? '...' : ''}`);
        storeResult(toolCallId, sessionKey, tool.name, params, resultText, !!result.isError);

        const content = result.content.map(block => {
          if (block.type === 'text') return { type: 'text' as const, text: block.text };
          if (block.type === 'image') return { type: 'image' as const, data: block.data, mimeType: block.mimeType };
          return { type: 'text' as const, text: '' };
        });

        if (resultTokens > LARGE_RESULT_TOKEN_THRESHOLD && content.length > 0 && content[0].type === 'text') {
          const warning = `⚠ Large tool response (~${(resultTokens / 1000).toFixed(1)}k tokens). Extract what you need and avoid additional large calls.\n\n`;
          content[0] = { type: 'text' as const, text: warning + content[0].text };
          log.info(`${tool.name}: large result warning (${resultTokens} tokens)`);
        }

        return { content, details: {} };
      } catch (err) {
        const message = toMessage(err);
        log.debug(`${tool.name} error: ${message}`);
        appendError({ tool: tool.name, sessionKey, message })
          .catch(e => log.debug(`error store: ${e}`));
        storeResult(toolCallId, sessionKey, tool.name, params, message, true);
        return {
          content: [{ type: 'text', text: `Error: ${message}` }],
          details: { error: message },
        };
      }
    },
  };
}

export function createVargosCustomTools(workingDir: string, sessionKey: string, bus: Bus): ToolDefinition[] {
  return toolRegistry.list().map(tool => wrapVargosTool(tool, workingDir, sessionKey, bus));
}

export function getVargosToolNames(): string[] {
  return toolRegistry.list().map(t => t.name);
}
