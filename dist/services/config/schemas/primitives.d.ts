/**
 * Primitive types and enums shared across config schemas
 */
import { z } from 'zod';
export type Json = string | number | boolean | null | Json[] | {
    [k: string]: Json;
};
export declare const JsonSchema: z.ZodType<Json>;
export declare const ThinkingLevelSchema: z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>;
export type ThinkingLevel = z.infer<typeof ThinkingLevelSchema>;
//# sourceMappingURL=primitives.d.ts.map