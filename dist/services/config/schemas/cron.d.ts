/**
 * Cron task configuration schemas
 */
import { z } from 'zod';
export declare const CronTaskSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    schedule: z.ZodString;
    task: z.ZodString;
    model: z.ZodOptional<z.ZodString>;
    notify: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    activeHours: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    activeHoursTimezone: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    enabled: boolean;
    schedule: string;
    task: string;
    model?: string | undefined;
    notify?: string[] | undefined;
    activeHours?: number[] | undefined;
    activeHoursTimezone?: string | undefined;
}, {
    id: string;
    name: string;
    schedule: string;
    task: string;
    enabled?: boolean | undefined;
    model?: string | undefined;
    notify?: string[] | undefined;
    activeHours?: number[] | undefined;
    activeHoursTimezone?: string | undefined;
}>;
export declare const CronAddSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    name: z.ZodString;
    schedule: z.ZodString;
    task: z.ZodString;
    model: z.ZodOptional<z.ZodString>;
    notify: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    activeHours: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    activeHoursTimezone: z.ZodOptional<z.ZodString>;
}, "id" | "enabled">, "strip", z.ZodTypeAny, {
    name: string;
    schedule: string;
    task: string;
    model?: string | undefined;
    notify?: string[] | undefined;
    activeHours?: number[] | undefined;
    activeHoursTimezone?: string | undefined;
}, {
    name: string;
    schedule: string;
    task: string;
    model?: string | undefined;
    notify?: string[] | undefined;
    activeHours?: number[] | undefined;
    activeHoursTimezone?: string | undefined;
}>;
export declare const CronUpdateSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    enabled: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    model: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    schedule: z.ZodOptional<z.ZodString>;
    task: z.ZodOptional<z.ZodString>;
    notify: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
    activeHours: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>>;
    activeHoursTimezone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name?: string | undefined;
    enabled?: boolean | undefined;
    model?: string | undefined;
    schedule?: string | undefined;
    task?: string | undefined;
    notify?: string[] | undefined;
    activeHours?: number[] | undefined;
    activeHoursTimezone?: string | undefined;
}, {
    id: string;
    name?: string | undefined;
    enabled?: boolean | undefined;
    model?: string | undefined;
    schedule?: string | undefined;
    task?: string | undefined;
    notify?: string[] | undefined;
    activeHours?: number[] | undefined;
    activeHoursTimezone?: string | undefined;
}>;
export type CronTask = z.infer<typeof CronTaskSchema>;
export type CronAddParams = z.infer<typeof CronAddSchema>;
export type CronUpdateParams = z.infer<typeof CronUpdateSchema>;
//# sourceMappingURL=cron.d.ts.map