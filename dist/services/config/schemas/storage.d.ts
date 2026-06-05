/**
 * Storage configuration schemas (memory backend hint)
 */
import { z } from 'zod';
export declare const StorageConfigSchema: z.ZodObject<{
    type: z.ZodDefault<z.ZodEnum<["sqlite", "postgres"]>>;
    url: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "sqlite" | "postgres";
    url?: string | undefined;
}, {
    type?: "sqlite" | "postgres" | undefined;
    url?: string | undefined;
}>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
//# sourceMappingURL=storage.d.ts.map