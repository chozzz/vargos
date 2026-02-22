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

  getGroups(): { core: Tool[]; external: Map<string, Tool[]> } {
    const core: Tool[] = [];
    const external = new Map<string, Tool[]>();
    for (const tool of this.tools.values()) {
      const i = tool.name.indexOf('__');
      if (i > 0) {
        const prefix = tool.name.slice(0, i);
        if (!external.has(prefix)) external.set(prefix, []);
        external.get(prefix)!.push(tool);
      } else {
        core.push(tool);
      }
    }
    return { core, external };
  }
}

// Singleton instance — populated by extensions during boot
export const toolRegistry = new ToolRegistry();
