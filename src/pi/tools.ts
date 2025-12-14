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

/**
 * Get full Vargos tool names (for documentation/MCP mode)
 * @deprecated Use getVargosToolNames() instead - it returns actual registered tools
 */
export function getFullVargosToolNames(): string[] {
  return [
    // Core file/shell tools
    'read', 'write', 'edit', 'exec',
    // Web tools
    'web_fetch',
    // Memory tools  
    'memory_search', 'memory_get',
    // Session tools
    'sessions_list', 'sessions_history', 'sessions_send', 'sessions_spawn',
    // Cron tools
    'cron_add', 'cron_list',
    // Process management
    'process',
    // Browser automation
    'browser',
  ];
}
