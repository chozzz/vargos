/**
 * Cron run tool - Trigger immediate execution of a scheduled task
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from '../types.js';

const CronRunParameters = z.object({
  id: z.string().describe('ID of the scheduled task to run immediately'),
});

export const cronRunTool: Tool = {
  name: 'cron_run',
  description: 'Trigger immediate execution of a scheduled task. Use cron_list to find task IDs.',
  parameters: CronRunParameters,
  formatCall: (args) => String(args.id || ''),
  execute: async (args: unknown, context: ToolContext) => {
    const { id } = CronRunParameters.parse(args);
    if (!context.call) return errorResult('Gateway not available');

    try {
      await context.call('cron', 'cron.run', { id });
      return textResult(`Triggered immediate run of task: ${id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Failed to run task: ${message}`);
    }
  },
};
