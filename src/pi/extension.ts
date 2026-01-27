/**
 * Vargos Pi SDK Extension
 * Wraps Vargos MCP tools into Pi SDK ToolDefinition format
 * Allows Pi SDK agent to use Vargos MCP tools
 */

import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { AgentToolResult, AgentToolUpdateCallback } from '@mariozechner/pi-agent-core';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { toolRegistry } from '../mcp/tools/registry.js';
import type { Tool, ToolContext } from '../mcp/tools/types.js';

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
      };

      // Log tool call to console
      const paramsStr = Object.entries(params).map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 100)}`).join(', ');
      console.error(`🔧 ${tool.name}: ${paramsStr}`);

      try {
        const result = await tool.execute(params, toolContext);

        // Log result preview
        const resultText = result.content.map(c => c.type === 'text' ? c.text : `[${c.type}]`).join(' ');
        const preview = resultText.slice(0, 200).replace(/\n/g, ' ');
        const status = result.isError ? '❌' : '✅';
        console.error(`${status} ${tool.name} → ${preview}${resultText.length > 200 ? '...' : ''}`);

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
        console.error(`❌ ${tool.name} → Error: ${message}`);
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
