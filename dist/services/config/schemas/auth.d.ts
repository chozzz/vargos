/**
 * Authentication configuration schemas
 *
 * Auth entries map provider names to credentials with type and key.
 */
import { z } from 'zod';
export declare const AuthEntrySchema: z.ZodObject<{
    type: z.ZodDefault<z.ZodEnum<["api_key"]>>;
    key: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "api_key";
    key: string;
}, {
    key: string;
    type?: "api_key" | undefined;
}>;
export declare const OAuthAuthEntrySchema: z.ZodObject<{
    type: z.ZodDefault<z.ZodEnum<["oauth"]>>;
    refresh: z.ZodString;
    access: z.ZodString;
    expires: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "oauth";
    refresh: string;
    access: string;
    expires: number;
}, {
    refresh: string;
    access: string;
    expires: number;
    type?: "oauth" | undefined;
}>;
export declare const AuthSchema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
    type: z.ZodDefault<z.ZodEnum<["api_key"]>>;
    key: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "api_key";
    key: string;
}, {
    key: string;
    type?: "api_key" | undefined;
}>, z.ZodObject<{
    type: z.ZodDefault<z.ZodEnum<["oauth"]>>;
    refresh: z.ZodString;
    access: z.ZodString;
    expires: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "oauth";
    refresh: string;
    access: string;
    expires: number;
}, {
    refresh: string;
    access: string;
    expires: number;
    type?: "oauth" | undefined;
}>]>>>;
export type AuthEntry = z.infer<typeof AuthEntrySchema>;
export type Auth = z.infer<typeof AuthSchema>;
//# sourceMappingURL=auth.d.ts.map