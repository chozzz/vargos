/**
 * Cron task configuration schemas
 */

import { z } from 'zod';

export const CronTaskSchema = z.object({
  id:       z.string(),
  name:     z.string(),
  schedule: z.string(),
  task:     z.string(),
  notify:   z.array(z.string()).optional(),
  enabled:  z.boolean().default(true),
});

export const CronAddSchema    = CronTaskSchema.omit({ id: true, enabled: true });
export const CronUpdateSchema = CronTaskSchema.partial().required({ id: true });

export type CronTask       = z.infer<typeof CronTaskSchema>;
export type CronAddParams  = z.infer<typeof CronAddSchema>;
export type CronUpdateParams = z.infer<typeof CronUpdateSchema>;
