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

const log = createLogger('tools');

// Gateway call function injected by start.ts after services connect
type GatewayCallFn = <T>(target: string, method: string, params?: unknown) => Promise<T>;
let gatewayCallFn: GatewayCallFn | undefined;

export function setGatewayCall(fn: GatewayCallFn): void {
  gatewayCallFn = fn;
}

/**
 * Convert Zod schema to JSON Schema for Pi SDK
 */
function createParamsSchema(zodSchema: import('zod').ZodSchema): any {
  // Convert Zod to JSON Schema
  const jsonSchema = zodToJsonSchema(zodSchema, {
    name: 'parameters',
    $refStrategy: 'none',
  });

  // Return the schema object (not the full wrapper)
  return jsonSchema.definitions?.parameters || jsonSchema;
}

/**
 * Wrap a Vargos MCP tool into Pi SDK ToolDefinition format
 */
function wrapVargosTool(tool: Tool, workingDir: string, sessionKey: string = 'default'): ToolDefinition {
  const parameters = createParamsSchema(tool.parameters);

  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters,
    execute: async (
      _toolCallId: string,
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
        const preview = resultText.slice(0, 200).replace(/\n/g, ' ');
        log.debug(`${tool.name} ${result.isError ? 'err' : 'ok'}: ${preview}${resultText.length > 200 ? '...' : ''}`);

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

        return {
          content,
          details: {},
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.debug(`${tool.name} error: ${message}`);
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
export function createVargosCustomTools(workingDir: string, sessionKey: string = 'default'): ToolDefinition[] {
  const tools = toolRegistry.list();
  return tools.map(tool => wrapVargosTool(tool, workingDir, sessionKey));
}

/**
 * Get Vargos tool names for system prompt
 */
export function getVargosToolNames(): string[] {
  return toolRegistry.list().map(t => t.name);
}
