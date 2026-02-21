/**
 * Tool registry - Extensions populate this via ctx.registerTool()
 */

import { Tool } from './types.js';
import { getLogger } from '../lib/logger.js';

const logger = getLogger('tools:registry');

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (!tool || !tool.name) {
      logger.error('Attempted to register invalid tool:', tool);
      throw new Error(`Invalid tool: ${JSON.stringify(tool)}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name?.trim());
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

// Singleton instance — populated by extensions during boot
export const toolRegistry = new ToolRegistry();
