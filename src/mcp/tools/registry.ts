/**
 * Tool registry - Dynamic tool loading with policy support
 *
 * Tools are registered lazily via initializeToolRegistry() to avoid
 * circular imports (tools → cron → pi/runtime → pi/extension → registry).
 */

import { Tool } from './types.js';

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (!tool || !tool.name) {
      console.error('Attempted to register invalid tool:', tool);
      throw new Error(`Invalid tool: ${JSON.stringify(tool)}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

// Singleton instance — empty until initializeToolRegistry() is called
export const toolRegistry = new ToolRegistry();

/**
 * Dynamically import and register all tools.
 * Called once from main() after modules have settled.
 */
export async function initializeToolRegistry(): Promise<void> {
  const [
    { readTool },
    { writeTool },
    { editTool },
    { execTool },
    { webFetchTool },
    { memorySearchTool },
    { memoryGetTool },
    { sessionsListTool },
    { sessionsHistoryTool },
    { sessionsSendTool },
    { sessionsSpawnTool },
    { cronAddTool },
    { cronListTool },
    { createProcessTool },
    { createBrowserTool },
  ] = await Promise.all([
    import('./read.js'),
    import('./write.js'),
    import('./edit.js'),
    import('./exec.js'),
    import('./web-fetch.js'),
    import('./memory-search.js'),
    import('./memory-get.js'),
    import('./sessions-list.js'),
    import('./sessions-history.js'),
    import('./sessions-send.js'),
    import('./sessions-spawn.js'),
    import('./cron-add.js'),
    import('./cron-list.js'),
    import('./process.js'),
    import('./browser.js'),
  ]);

  toolRegistry.register(readTool);
  toolRegistry.register(writeTool);
  toolRegistry.register(editTool);
  toolRegistry.register(execTool);
  toolRegistry.register(webFetchTool);
  toolRegistry.register(memorySearchTool);
  toolRegistry.register(memoryGetTool);
  toolRegistry.register(sessionsListTool);
  toolRegistry.register(sessionsHistoryTool);
  toolRegistry.register(sessionsSendTool);
  toolRegistry.register(sessionsSpawnTool);
  toolRegistry.register(cronAddTool);
  toolRegistry.register(cronListTool);
  toolRegistry.register(createProcessTool());
  toolRegistry.register(createBrowserTool());
}
