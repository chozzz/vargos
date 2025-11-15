/**
 * Pi SDK to Vargos Tools Bridge
 * Intercepts Pi tool calls and routes them to Vargos MCP tools
 * Like OpenClaw's tool routing layer
 */

import { ToolRegistry, toolRegistry } from '../mcp/tools/index.js';
import { ToolContext } from '../mcp/tools/types.js';
import { 
  isSubagentSessionKey, 
  isToolAllowedForSubagent, 
  formatErrorResult 
} from '../utils/errors.js';

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
      return await executeVargosToolInternal(tool.name, args, config);
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
 * Internal tool execution with shared logic
 */
async function executeVargosToolInternal(
  toolName: string,
  args: unknown,
  config: BridgeConfig
): Promise<PiToolResult> {
  const tool = toolRegistry.get(toolName);
  
  if (!tool) {
    return formatErrorResult(`Unknown tool: ${toolName}`);
  }

  // Filter tools for subagents
  if (isSubagentSessionKey(config.sessionKey) && !isToolAllowedForSubagent(toolName)) {
    return formatErrorResult(`Tool '${toolName}' is not available to subagents.`);
  }

  const context: ToolContext = {
    sessionKey: config.sessionKey,
    workingDir: config.workspaceDir,
  };

  try {
    return await tool.execute(args, context);
  } catch (err) {
    return formatErrorResult(err);
  }
}

/**
 * Bridge Pi tool call to Vargos tool
 */
export async function executeVargosTool(
  toolName: string,
  args: unknown,
  config: BridgeConfig
): Promise<PiToolResult> {
  return executeVargosToolInternal(toolName, args, config);
}
