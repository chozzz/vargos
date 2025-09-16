/**
 * Tool registry - Dynamic tool loading
 * Ported from OpenClaw patterns
 */

import { Tool } from './types.js';
import { readTool } from './read.js';
import { writeTool } from './write.js';
import { editTool } from './edit.js';
import { execTool } from './exec.js';
import { webFetchTool } from './web-fetch.js';
import { memorySearchTool } from './memory-search.js';
import { memoryGetTool } from './memory-get.js';
import { sessionsListTool } from './sessions-list.js';
import { sessionsSendTool } from './sessions-send.js';
import { sessionsSpawnTool } from './sessions-spawn.js';
import { createProcessTool } from './process.js';
import { createBrowserTool } from './browser.js';

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  constructor() {
    // Register built-in tools
    this.register(readTool);
    this.register(writeTool);
    this.register(editTool);
    this.register(execTool);
    this.register(webFetchTool);
    this.register(memorySearchTool);
    this.register(memoryGetTool);
    this.register(sessionsListTool);
    this.register(sessionsSendTool);
    this.register(sessionsSpawnTool);
    this.register(createProcessTool());
    this.register(createBrowserTool());
  }

  register(tool: Tool): void {
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

// Singleton instance
export const toolRegistry = new ToolRegistry();
