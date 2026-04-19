/**
 * Cron task configuration schemas
 */

import { z } from 'zod';

export const CronTaskSchema = z.object({
  id:                   z.string().describe('Unique identifier for the task'),
  name:                 z.string().describe('Human-readable task name'),
  schedule:             z.string().describe('Cron schedule expression (e.g., "0 9 * * *" for 9am daily)'),
  task:                 z.string().describe('Task prompt/instruction to execute. Supports ${WORKSPACE_DIR}, ${DATA_DIR}, etc. interpolation'),
  notify:               z.array(z.string()).optional().describe('Channel session keys to send results to (e.g., "whatsapp-vadi-indo:61423222658")'),
  enabled:              z.boolean().default(true).describe('Whether the task is active'),
  activeHours:          z.array(z.number()).optional().describe('Active hours window [startHour, endHour] for conditional execution (0-23)'),
  activeHoursTimezone:  z.string().optional().describe('IANA timezone for activeHours interpretation (e.g., "Australia/Sydney")'),
});

export const CronAddSchema    = CronTaskSchema.omit({ id: true, enabled: true });
export const CronUpdateSchema = CronTaskSchema.partial().required({ id: true });

export type CronTask       = z.infer<typeof CronTaskSchema>;
export type CronAddParams  = z.infer<typeof CronAddSchema>;
export type CronUpdateParams = z.infer<typeof CronUpdateSchema>;
