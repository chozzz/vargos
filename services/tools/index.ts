import type { Bus } from '../../gateway/bus.js';
import { toolRegistry } from './registry.js';
import { readTool, writeTool, editTool, execTool } from './fs.js';
import { webFetchTool } from './web.js';
import { memorySearchTool, memoryGetTool, memoryWriteTool } from './memory-tools.js';
import { agentTools } from './agent-tools.js';

export { toolRegistry } from './registry.js';
export type { Tool, ToolContext, ToolResult } from './types.js';
export { textResult, errorResult, imageResult } from './types.js';

// ── Boot ──────────────────────────────────────────────────────────────────────
// Populates the singleton registry — must be called before AgentService boots.

export async function boot(_bus: Bus): Promise<{ stop?(): void }> {
  // FS
  toolRegistry.register(readTool);
  toolRegistry.register(writeTool);
  toolRegistry.register(editTool);
  toolRegistry.register(execTool);

  // Web
  toolRegistry.register(webFetchTool);

  // Memory
  toolRegistry.register(memorySearchTool);
  toolRegistry.register(memoryGetTool);
  toolRegistry.register(memoryWriteTool);

  // Agent / session / cron tools
  for (const tool of agentTools) {
    toolRegistry.register(tool);
  }

  return {};
}
