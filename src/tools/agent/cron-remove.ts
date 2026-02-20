/**
 * Cron remove tool - Remove scheduled tasks via gateway RPC
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from '../types.js';

const CronRemoveParameters = z.object({
  id: z.string().describe('ID of the scheduled task to remove'),
});

export const cronRemoveTool: Tool = {
  name: 'cron_remove',
  description: 'Remove a scheduled recurring task by its ID. Use cron_list to find task IDs.',
  parameters: CronRemoveParameters,
  formatCall: (args) => String(args.id || ''),
  execute: async (args: unknown, context: ToolContext) => {
    const { id } = CronRemoveParameters.parse(args);
    if (!context.call) return errorResult('Gateway not available');

    try {
      const removed = await context.call<boolean>('cron', 'cron.remove', { id });
      if (removed) {
        return textResult(`Removed scheduled task: ${id}`);
      }
      return errorResult(`Task not found: ${id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Failed to remove scheduled task: ${message}`);
    }
  },
};
