/**
 * Pi SDK to Vargos Tools Bridge
 * Intercepts Pi tool calls and routes them to Vargos MCP tools
 * Like OpenClaw's tool routing layer
 */

import { ToolRegistry, toolRegistry } from '../mcp/tools/index.js';
import { ToolContext } from '../mcp/tools/types.js';
import { getSessionService } from '../services/factory.js';
import { isSubagentSessionKey } from '../agent/prompt.js';
import path from 'node:path';

export interface BridgeConfig {
  sessionKey: string;
  workspaceDir: string;
}

/**
 * Vargos tool definitions formatted for Pi SDK
 */
export function createVargosToolsForPi(config: BridgeConfig) {
  const tools = toolRegistry.list();
  
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    execute: async (args: unknown) => {
      const context: ToolContext = {
        sessionKey: config.sessionKey,
        workingDir: config.workspaceDir,
      };

      // Filter tools for subagents
      if (isSubagentSessionKey(config.sessionKey)) {
        const deniedTools = ['sessions_list', 'sessions_history', 'sessions_send', 'sessions_spawn'];
        if (deniedTools.includes(tool.name)) {
          return {
            content: [{ type: 'text', text: `Tool '${tool.name}' is not available to subagents.` }],
            isError: true,
          };
        }
      }

      try {
        const result = await tool.execute(args, context);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: `Tool execution failed: ${message}` }],
          isError: true,
        };
      }
    },
  }));
}

/**
 * Tool execution result formatted for Pi SDK
 */
export interface PiToolResult {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  isError?: boolean;
}

/**
 * Bridge Pi tool call to Vargos tool
 */
export async function executeVargosTool(
  toolName: string,
  args: unknown,
  config: BridgeConfig
): Promise<PiToolResult> {
  const tool = toolRegistry.get(toolName);
  
  if (!tool) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
      isError: true,
    };
  }

  const context: ToolContext = {
    sessionKey: config.sessionKey,
    workingDir: config.workspaceDir,
  };

  // Filter tools for subagents
  if (isSubagentSessionKey(config.sessionKey)) {
    const deniedTools = ['sessions_list', 'sessions_history', 'sessions_send', 'sessions_spawn'];
    if (deniedTools.includes(toolName)) {
      return {
        content: [{ type: 'text', text: `Tool '${toolName}' is not available to subagents.` }],
        isError: true,
      };
    }
  }

  try {
    const result = await tool.execute(args, context);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Tool execution failed: ${message}` }],
      isError: true,
    };
  }
}
