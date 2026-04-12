/**
 * Storage configuration schemas (memory backend hint)
 */

import { z } from 'zod';

export const StorageConfigSchema = z.object({
  type: z.enum(['sqlite', 'postgres']).default('sqlite'),
  url:  z.string().optional(),
});

export type StorageConfig = z.infer<typeof StorageConfigSchema>;
