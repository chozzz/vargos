/**
 * Feature-specific configuration schemas (Heartbeat, LinkExpand)
 */

import { z } from 'zod';

export const HeartbeatConfigSchema = z.object({
  enabled:          z.boolean().default(true),
  intervalMinutes:  z.number().int().positive().default(30),
  // [startHour, endHour] — see activeHoursTimezone (default: UTC)
  activeHours:      z.tuple([z.number().int().min(0).max(23), z.number().int().min(0).max(23)]).optional(),
  /** IANA zone id, e.g. Australia/Sydney — when set, activeHours are interpreted in this zone */
  activeHoursTimezone: z.string().optional(),
  notify:           z.array(z.string()).optional(),
});

export const LinkExpandConfigSchema = z.object({
  enabled:       z.boolean().default(true),
  maxUrls:       z.number().int().positive().default(3),
  maxCharsPerUrl: z.number().int().positive().default(8_000),
  timeoutMs:     z.number().int().positive().default(5_000),
});

export type HeartbeatConfig  = z.infer<typeof HeartbeatConfigSchema>;
export type LinkExpandConfig = z.infer<typeof LinkExpandConfigSchema>;
