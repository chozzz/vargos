/**
 * Vargos Tools for Pi SDK
 * 
 * Note: CLI chat mode uses Pi SDK's createCodingTools() which provides:
 * - read, bash, edit, write, grep, find, ls
 * 
 * Full Vargos tools (browser, memory, sessions, cron, process) are available
 * via the MCP server interface (stdio or HTTP).
 * 
 * This architecture separates:
 * - CLI chat: Basic coding tools via Pi SDK
 * - MCP server: Full Vargos tool set for IDE integration
 */

import { createCodingTools } from '@mariozechner/pi-coding-agent';
import type { AgentTool } from '@mariozechner/pi-agent-core';

/**
 * Create Vargos tools for Pi SDK CLI mode
 * Currently returns Pi's coding tools. Full Vargos tools available via MCP server.
 */
export function createVargosTools(cwd: string): AgentTool[] {
  return createCodingTools(cwd);
}

/**
 * Get tool names for system prompt
 * Lists Pi SDK tools available in CLI chat mode
 */
export function getVargosToolNames(): string[] {
  // Pi SDK coding tools available in CLI mode
  return ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'];
}

/**
 * Get full Vargos tool names (for documentation/MCP mode)
 */
export function getFullVargosToolNames(): string[] {
  return [
    // Core file/shell tools (Pi SDK)
    'read', 'bash', 'edit', 'write', 'grep', 'find', 'ls',
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
