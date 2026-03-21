/**
 * Cron tool extension — schedule, list, update, and trigger recurring tasks
 */

import { z } from 'zod';
import type { VargosExtension, ExtensionContext } from '../../extension.js';
import { defineGatewayTool, textResult, errorResult } from '../../lib/gateway-tool.js';

// --- Schemas ---

const CronListParameters = z.object({});

const CronAddParameters = z.object({
  id: z.string().describe('Unique slug ID for the task (e.g., "daily-report")'),
  schedule: z.string().describe('Cron expression (e.g., "0 * * * *" for hourly)'),
  task: z.string().describe('Task description to execute'),
  name: z.string().optional().describe('Display name (defaults to id)'),
  enabled: z.boolean().optional().default(true).describe('Whether to enable immediately'),
  notify: z.array(z.string()).optional().describe('Channel targets to notify (e.g., ["whatsapp:614...", "telegram:123"])'),
});

const CronRemoveParameters = z.object({
  id: z.string().describe('ID of the scheduled task to remove'),
});

const CronRunParameters = z.object({
  id: z.string().describe('ID of the scheduled task to run immediately'),
});

const CronUpdateParameters = z.object({
  id: z.string().describe('ID of the scheduled task to update'),
  name: z.string().optional().describe('New name for the task'),
  schedule: z.string().optional().describe('New cron expression'),
  task: z.string().optional().describe('New task description'),
  enabled: z.boolean().optional().describe('Enable or disable the task'),
  notify: z.array(z.string()).optional().describe('Channel targets to notify'),
});

// --- Extension ---

export class CronExtension implements VargosExtension {
  readonly id = 'tools-cron';
  readonly name = 'Cron Tools';

  register(ctx: ExtensionContext): void {
    ctx.registerTool(defineGatewayTool({
      name: 'cron_list',
      description: 'List all scheduled cron tasks',
      parameters: CronListParameters,
      service: 'cron',
      method: 'cron.list',
      execute: async (_args, call) => {
        const tasks = await call<any[]>('cron', 'cron.list');
        if (tasks.length === 0) {
          return textResult('No scheduled tasks found.\n\nUse cron_add to create one.');
        }
        const lines = [
          `Scheduled Tasks (${tasks.length}):`,
          '',
          ...tasks.map(t =>
            `- ${t.name}\n` +
            `  ID: ${t.id}\n` +
            `  Schedule: ${t.schedule}\n` +
            `  Status: ${t.enabled ? 'Enabled' : 'Disabled'}\n` +
            `  Desc: ${(t.description || '').slice(0, 60)}...`
          ),
        ];
        return textResult(lines.join('\n'));
      },
    }));

    ctx.registerTool(defineGatewayTool({
      name: 'cron_add',
      description: 'Schedule a recurring task to run on a cron schedule. Spawns a subagent at each interval.',
      parameters: CronAddParameters,
      service: 'cron',
      method: 'cron.add',
      formatCall: (args) => `${args.id || ''} ${args.schedule || ''}`,
      execute: async (params, call) => {
        const task = await call<{ id: string; name: string }>('cron', 'cron.add', {
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
      },
    }));

    ctx.registerTool(defineGatewayTool({
      name: 'cron_remove',
      description: 'Remove a scheduled recurring task by its ID. Use cron_list to find task IDs.',
      parameters: CronRemoveParameters,
      service: 'cron',
      method: 'cron.remove',
      formatCall: (args) => String(args.id || ''),
      execute: async ({ id }, call) => {
        const removed = await call<boolean>('cron', 'cron.remove', { id });
        if (removed) return textResult(`Removed scheduled task: ${id}`);
        return errorResult(`Task not found: ${id}`);
      },
    }));

    ctx.registerTool(defineGatewayTool({
      name: 'cron_run',
      description: 'Trigger immediate execution of a scheduled task. Use cron_list to find task IDs.',
      parameters: CronRunParameters,
      service: 'cron',
      method: 'cron.run',
      formatCall: (args) => String(args.id || ''),
      execute: async ({ id }, call) => {
        await call('cron', 'cron.run', { id });
        return textResult(`Triggered immediate run of task: ${id}`);
      },
    }));

    ctx.registerTool(defineGatewayTool({
      name: 'cron_update',
      description: 'Update a scheduled cron task (name, schedule, task, enabled, notify). Use cron_list to find task IDs.',
      parameters: CronUpdateParameters,
      service: 'cron',
      method: 'cron.update',
      formatCall: (args) => String(args.id || ''),
      execute: async ({ id, ...fields }, call) => {
        const updated = await call<{ id: string }>('cron', 'cron.update', { id, ...fields });
        return textResult(`Updated scheduled task: ${updated.id}`);
      },
    }));
  }
}
