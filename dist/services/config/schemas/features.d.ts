/**
 * Feature-specific configuration schemas (Heartbeat, LinkExpand)
 */
import { z } from 'zod';
export declare const HeartbeatConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    intervalMinutes: z.ZodDefault<z.ZodNumber>;
    activeHours: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
    /** IANA zone id, e.g. Australia/Sydney — when set, activeHours are interpreted in this zone */
    activeHoursTimezone: z.ZodOptional<z.ZodString>;
    notify: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    intervalMinutes: number;
    notify?: string[] | undefined;
    activeHours?: [number, number] | undefined;
    activeHoursTimezone?: string | undefined;
}, {
    enabled?: boolean | undefined;
    notify?: string[] | undefined;
    activeHours?: [number, number] | undefined;
    activeHoursTimezone?: string | undefined;
    intervalMinutes?: number | undefined;
}>;
export declare const LinkExpandConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    maxUrls: z.ZodDefault<z.ZodNumber>;
    maxCharsPerUrl: z.ZodDefault<z.ZodNumber>;
    timeoutMs: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    maxUrls: number;
    maxCharsPerUrl: number;
    timeoutMs: number;
}, {
    enabled?: boolean | undefined;
    maxUrls?: number | undefined;
    maxCharsPerUrl?: number | undefined;
    timeoutMs?: number | undefined;
}>;
export type HeartbeatConfig = z.infer<typeof HeartbeatConfigSchema>;
export type LinkExpandConfig = z.infer<typeof LinkExpandConfigSchema>;
//# sourceMappingURL=features.d.ts.map