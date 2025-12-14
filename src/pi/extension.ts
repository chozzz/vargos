/**
 * Vargos Pi SDK Extension
 * Wraps Vargos MCP tools into Pi SDK ToolDefinition format
 * Allows Pi SDK agent to use Vargos tools exactly like OpenClaw
 */

import type { ToolDefinition, ExtensionAPI, ExtensionFactory } from '@mariozechner/pi-coding-agent';
import type { AgentToolResult, AgentToolUpdateCallback } from '@mariozechner/pi-agent-core';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { toolRegistry } from '../mcp/tools/registry.js';
import type { Tool, ToolContext } from '../mcp/tools/types.js';

// Session key for CLI mode
const CLI_SESSION_KEY = 'cli:main';

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
function wrapVargosTool(tool: Tool, workingDir: string): ToolDefinition {
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
        sessionKey: CLI_SESSION_KEY,
        workingDir,
      };

      try {
        const result = await tool.execute(params, toolContext);
        
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
export function createVargosCustomTools(workingDir: string): ToolDefinition[] {
  const tools = toolRegistry.list();
  return tools.map(tool => wrapVargosTool(tool, workingDir));
}

/**
 * Create Vargos Pi SDK Extension Factory
 * Registers Vargos MCP tools as Pi SDK tools
 */
export function createVargosExtensionFactory(workingDir: string): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    // Register all Vargos tools
    const tools = toolRegistry.list();
    for (const tool of tools) {
      const wrappedTool = wrapVargosTool(tool, workingDir);
      pi.registerTool(wrappedTool);
    }
  };
}

/**
 * Get Vargos tool names for system prompt
 */
export function getVargosToolNames(): string[] {
  return toolRegistry.list().map(t => t.name);
}
