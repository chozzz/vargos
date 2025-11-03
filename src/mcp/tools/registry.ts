/**
 * Tool registry - Dynamic tool loading with policy support
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
import { sessionsHistoryTool } from './sessions-history.js';
import { sessionsSendTool } from './sessions-send.js';
import { sessionsSpawnTool } from './sessions-spawn.js';
import { cronAddTool } from './cron-add.js';
import { cronListTool } from './cron-list.js';
import { createProcessTool } from './process.js';
import { createBrowserTool } from './browser.js';

// Tool groups (like OpenClaw)
export const TOOL_GROUPS = {
  runtime: ['exec', 'process', 'bash'],
  fs: ['read', 'write', 'edit', 'apply_patch'],
  sessions: ['sessions_list', 'sessions_history', 'sessions_send', 'sessions_spawn', 'session_status'],
  memory: ['memory_search', 'memory_get'],
  ui: ['browser', 'canvas'],
  automation: ['cron_add', 'cron_list', 'cron_remove', 'cron_enable', 'cron_disable', 'gateway'],
  messaging: ['message'],
};

// Default subagent tool deny list (like OpenClaw)
export const DEFAULT_SUBAGENT_DENY_LIST = [
  'sessions_list',
  'sessions_history',
  'sessions_send',
  'sessions_spawn',
];

export interface ToolPolicy {
  allow?: string[];
  deny?: string[];
}

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
    this.register(sessionsHistoryTool);
    this.register(sessionsSendTool);
    this.register(sessionsSpawnTool);
    this.register(cronAddTool);
    this.register(cronListTool);
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

  /**
   * Filter tools by policy
   * Like OpenClaw's tool policy filtering
   */
  filterByPolicy(policy?: ToolPolicy): Tool[] {
    const allTools = this.list();

    if (!policy) {
      return allTools;
    }

    // Expand groups
    const expandGroups = (tools: string[]): string[] => {
      const expanded: string[] = [];
      for (const tool of tools) {
        if (tool.startsWith('group:')) {
          const groupName = tool.slice(6);
          const groupTools = TOOL_GROUPS[groupName as keyof typeof TOOL_GROUPS];
          if (groupTools) {
            expanded.push(...groupTools);
          }
        } else {
          expanded.push(tool);
        }
      }
      return expanded;
    };

    const allowed = policy.allow ? new Set(expandGroups(policy.allow)) : null;
    const denied = policy.deny ? new Set(expandGroups(policy.deny)) : null;

    return allTools.filter((tool) => {
      // Deny wins
      if (denied?.has(tool.name)) {
        return false;
      }
      // If allow list exists, only allow those
      if (allowed && !allowed.has(tool.name)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Get tools for subagent (with default restrictions)
   */
  getSubagentTools(): Tool[] {
    return this.filterByPolicy({
      deny: DEFAULT_SUBAGENT_DENY_LIST,
    });
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
