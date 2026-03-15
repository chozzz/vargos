/**
 * Vargos Pi SDK Extension
 * Wraps Vargos MCP tools into Pi SDK ToolDefinition format
 * Allows Pi SDK agent to use Vargos MCP tools
 */

import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { AgentToolResult, AgentToolUpdateCallback } from '@mariozechner/pi-agent-core';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { toolRegistry } from '../tools/registry.js';
import type { Tool, ToolContext } from '../tools/types.js';
import { createLogger } from '../lib/logger.js';
import { toMessage } from '../lib/error.js';
import { appendError } from '../lib/error-store.js';
import { appendToolResult, charsToTokens } from '../lib/tool-store.js';

const log = createLogger('tools');

/** Tool results above this threshold get a warning prepended */
const LARGE_RESULT_TOKEN_THRESHOLD = 5_000;

// Gateway call function injected by start.ts after services connect
type GatewayCallFn = <T>(target: string, method: string, params?: unknown) => Promise<T>;

let _gatewayCallFn: GatewayCallFn | undefined;

function gatewayCallFn<T>(target: string, method: string, params?: unknown): Promise<T> {
  if (!_gatewayCallFn) {
    throw new Error('Gateway call function not set — call setGatewayCall() before using tools');
  }
  return _gatewayCallFn<T>(target, method, params);
}

export function setGatewayCall(fn: GatewayCallFn): void {
  _gatewayCallFn = fn;
}

/**
 * Convert Zod schema to JSON Schema for Pi SDK
 */
function createParamsSchema(zodSchema: import('zod').ZodSchema): ToolDefinition['parameters'] {
  const jsonSchema = zodToJsonSchema(zodSchema, {
    name: 'parameters',
    $refStrategy: 'none',
  });

  // zodToJsonSchema produces a JSON Schema object compatible with TypeBox at runtime
  return (jsonSchema.definitions?.parameters || jsonSchema) as ToolDefinition['parameters'];
}

/**
 * Wrap a Vargos MCP tool into Pi SDK ToolDefinition format
 */
function wrapVargosTool(
  tool: Tool,
  workingDir: string,
  sessionKey: string = 'default',
): ToolDefinition {
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
      _signal?: AbortSignal
    ): Promise<AgentToolResult<unknown>> => {
      const toolContext: ToolContext = {
        sessionKey,
        workingDir,
        call: gatewayCallFn,
      };

      const paramsStr = Object.entries(params).map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 100)}`).join(', ');
      log.debug(`${tool.name}: ${paramsStr}`);

      try {
        const result = await tool.execute(params, toolContext);

        const resultText = result.content.map(c => c.type === 'text' ? c.text : `[${c.type}]`).join(' ');
        const resultChars = resultText.length;
        const resultTokens = charsToTokens(resultChars);
        const preview = resultText.slice(0, 500).replace(/\n/g, ' ');
        log.debug(`${tool.name} ${result.isError ? 'err' : 'ok'} (${resultTokens} tokens): ${preview.slice(0, 200)}${resultChars > 200 ? '...' : ''}`);
        storeResult(toolCallId, sessionKey, tool.name, params, resultText, !!result.isError);

        // Convert Vargos ToolResult to Pi SDK AgentToolResult
        const content = result.content.map(block => {
          if (block.type === 'text') {
            return { type: 'text' as const, text: block.text };
          } else if (block.type === 'image') {
            return {
              type: 'image' as const,
              data: block.data,
              mimeType: block.mimeType
            };
          }
          return { type: 'text' as const, text: '' };
        });

        // Warn agent about large results that risk filling context
        if (resultTokens > LARGE_RESULT_TOKEN_THRESHOLD && content.length > 0 && content[0].type === 'text') {
          const warning = `⚠ Large tool response (~${(resultTokens / 1000).toFixed(1)}k tokens). Extract what you need and avoid additional large calls.\n\n`;
          content[0] = { type: 'text' as const, text: warning + content[0].text };
          log.info(`${tool.name}: large result warning (${resultTokens} tokens)`);
        }

        return {
          content,
          details: {},
        };
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

/**
 * Create Vargos custom tools for Pi SDK
 * These are passed as customTools to createAgentSession
 */
export function createVargosCustomTools(
  workingDir: string,
  sessionKey: string = 'default',
): ToolDefinition[] {
  const tools = toolRegistry.list();
  return tools.map(tool => wrapVargosTool(tool, workingDir, sessionKey));
}

/**
 * Get Vargos tool names for system prompt
 */
export function getVargosToolNames(): string[] {
  return toolRegistry.list().map(t => t.name);
}
