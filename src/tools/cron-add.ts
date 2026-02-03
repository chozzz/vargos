/**
 * Cron add tool - Schedule recurring tasks
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from './types.js';
import { getCronScheduler } from '../cron/index.js';

const CronAddParameters = z.object({
  name: z.string().describe('Name of the scheduled task'),
  schedule: z.string().describe('Cron expression (e.g., "0 * * * *" for hourly, "0 9 * * *" for daily at 9am)'),
  task: z.string().describe('Task description to execute'),
  enabled: z.boolean().optional().default(true).describe('Whether to enable immediately'),
});

export const cronAddTool: Tool = {
  name: 'cron_add',
  description: 'Schedule a recurring task to run on a cron schedule. Spawns a subagent at each interval.',
  parameters: CronAddParameters,
  execute: async (args: unknown, context: ToolContext) => {
    const params = CronAddParameters.parse(args);

    try {
      const scheduler = getCronScheduler(context.workingDir);
      
      const task = scheduler.addTask({
        name: params.name,
        schedule: params.schedule,
        description: params.task.slice(0, 100),
        task: params.task,
        enabled: params.enabled,
      });

      return textResult(
        `✅ Scheduled task created\n\n` +
        `ID: ${task.id}\n` +
        `Name: ${params.name}\n` +
        `Schedule: ${params.schedule}\n` +
        `Status: ${params.enabled ? 'Enabled' : 'Disabled'}\n\n` +
        `The task will spawn a subagent at each interval.\n` +
        `Use cron_list to see all tasks, cron_remove to delete.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Failed to create scheduled task: ${message}`);
    }
  },
};
