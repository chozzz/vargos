/**
 * Cron update tool - Modify existing scheduled tasks via gateway RPC
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from '../types.js';

const CronUpdateParameters = z.object({
  id: z.string().describe('ID of the scheduled task to update'),
  name: z.string().optional().describe('New name for the task'),
  schedule: z.string().optional().describe('New cron expression'),
  task: z.string().optional().describe('New task description'),
  enabled: z.boolean().optional().describe('Enable or disable the task'),
  notify: z.array(z.string()).optional().describe('Channel targets to notify'),
});

export const cronUpdateTool: Tool = {
  name: 'cron_update',
  description: 'Update a scheduled cron task (name, schedule, task, enabled, notify). Use cron_list to find task IDs.',
  parameters: CronUpdateParameters,
  formatCall: (args) => String(args.id || ''),
  execute: async (args: unknown, context: ToolContext) => {
    const { id, ...fields } = CronUpdateParameters.parse(args);
    if (!context.call) return errorResult('Gateway not available');

    try {
      const updated = await context.call<{ id: string }>('cron', 'cron.update', { id, ...fields });
      return textResult(`Updated scheduled task: ${updated.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Failed to update scheduled task: ${message}`);
    }
  },
};
