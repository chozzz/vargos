/**
 * Vargos Tools for Pi SDK
 * 
 * Bridges Vargos MCP tools with Pi SDK
 * - Vargos MCP tools are registered in toolRegistry
 * - Pi SDK uses these via extension.ts
 */

import { createCodingTools } from '@mariozechner/pi-coding-agent';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { toolRegistry } from '../mcp/tools/registry.js';

/**
 * Create Vargos tools for Pi SDK CLI mode
 * Returns Pi's coding tools for low-level file operations
 */
export function createVargosTools(cwd: string): AgentTool[] {
  return createCodingTools(cwd);
}

/**
 * Get tool names for system prompt
 * Lists actual registered Vargos MCP tools (what the agent can actually use)
 */
export function getVargosToolNames(): string[] {
  // Return actual registered MCP tool names from registry
  return toolRegistry.list().map(t => t.name);
}
