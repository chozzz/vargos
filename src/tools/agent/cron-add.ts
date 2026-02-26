/**
 * Cron add tool - Schedule recurring tasks via gateway RPC
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from '../types.js';

const CronAddParameters = z.object({
  id: z.string().describe('Unique slug ID for the task (e.g., "daily-report")'),
  schedule: z.string().describe('Cron expression (e.g., "0 * * * *" for hourly)'),
  task: z.string().describe('Task description to execute'),
  name: z.string().optional().describe('Display name (defaults to id)'),
  enabled: z.boolean().optional().default(true).describe('Whether to enable immediately'),
  notify: z.array(z.string()).optional().describe('Channel targets to notify (e.g., ["whatsapp:614...", "telegram:123"])'),
});

export const cronAddTool: Tool = {
  name: 'cron_add',
  description: 'Schedule a recurring task to run on a cron schedule. Spawns a subagent at each interval.',
  parameters: CronAddParameters,
  formatCall: (args) => `${args.id || ''} ${args.schedule || ''}`,
  execute: async (args: unknown, context: ToolContext) => {
    const params = CronAddParameters.parse(args);
    if (!context.call) return errorResult('Gateway not available');

    try {
      const task = await context.call<{ id: string; name: string }>('cron', 'cron.add', {
        id: params.id,
        schedule: params.schedule,
        task: params.task,
        name: params.name,
        enabled: params.enabled,
        notify: params.notify,
      });

      return textResult(
        `Scheduled task created\n\n` +
        `ID: ${task.id}\n` +
        `Name: ${task.name}\n` +
        `Schedule: ${params.schedule}\n` +
        `Status: ${params.enabled ? 'Enabled' : 'Disabled'}\n\n` +
        `Use cron_list to see all tasks.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Failed to create scheduled task: ${message}`);
    }
  },
};
