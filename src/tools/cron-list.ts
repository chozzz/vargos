/**
 * Cron list tool - Show scheduled tasks
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from './types.js';
import { getCronScheduler } from '../cron/index.js';

const CronListParameters = z.object({});

export const cronListTool: Tool = {
  name: 'cron_list',
  description: 'List all scheduled cron tasks',
  parameters: CronListParameters,
  execute: async (_args: unknown, context: ToolContext) => {
    try {
      const scheduler = getCronScheduler(context.workingDir);
      const tasks = scheduler.listTasks();

      if (tasks.length === 0) {
        return textResult('No scheduled tasks found.\n\nUse cron_add to create one.');
      }

      const lines = [
        `📅 Scheduled Tasks (${tasks.length}):`,
        '',
        ...tasks.map(t => 
          `• ${t.name}\n` +
          `  ID: ${t.id}\n` +
          `  Schedule: ${t.schedule}\n` +
          `  Status: ${t.enabled ? '✅ Enabled' : '⏸️  Disabled'}\n` +
          `  Desc: ${t.description.slice(0, 60)}...`
        ),
      ];

      return textResult(lines.join('\n'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Failed to list tasks: ${message}`);
    }
  },
};
