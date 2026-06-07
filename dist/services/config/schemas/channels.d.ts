/**
 * Channel configuration schemas
 */
import { z } from 'zod';
export declare const TelegramChannelSchema: z.ZodObject<{
    id: z.ZodString;
    enabled: z.ZodDefault<z.ZodBoolean>;
    model: z.ZodOptional<z.ZodString>;
    debounceMs: z.ZodOptional<z.ZodNumber>;
    allowFrom: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    cwd: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"telegram">;
    botToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "telegram";
    id: string;
    enabled: boolean;
    botToken: string;
    model?: string | undefined;
    debounceMs?: number | undefined;
    allowFrom?: string[] | undefined;
    cwd?: string | undefined;
}, {
    type: "telegram";
    id: string;
    botToken: string;
    enabled?: boolean | undefined;
    model?: string | undefined;
    debounceMs?: number | undefined;
    allowFrom?: string[] | undefined;
    cwd?: string | undefined;
}>;
export declare const WhatsAppChannelSchema: z.ZodObject<{
    id: z.ZodString;
    enabled: z.ZodDefault<z.ZodBoolean>;
    model: z.ZodOptional<z.ZodString>;
    debounceMs: z.ZodOptional<z.ZodNumber>;
    allowFrom: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    cwd: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"whatsapp">;
}, "strip", z.ZodTypeAny, {
    type: "whatsapp";
    id: string;
    enabled: boolean;
    model?: string | undefined;
    debounceMs?: number | undefined;
    allowFrom?: string[] | undefined;
    cwd?: string | undefined;
}, {
    type: "whatsapp";
    id: string;
    enabled?: boolean | undefined;
    model?: string | undefined;
    debounceMs?: number | undefined;
    allowFrom?: string[] | undefined;
    cwd?: string | undefined;
}>;
export declare const ChannelEntrySchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    id: z.ZodString;
    enabled: z.ZodDefault<z.ZodBoolean>;
    model: z.ZodOptional<z.ZodString>;
    debounceMs: z.ZodOptional<z.ZodNumber>;
    allowFrom: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    cwd: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"telegram">;
    botToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "telegram";
    id: string;
    enabled: boolean;
    botToken: string;
    model?: string | undefined;
    debounceMs?: number | undefined;
    allowFrom?: string[] | undefined;
    cwd?: string | undefined;
}, {
    type: "telegram";
    id: string;
    botToken: string;
    enabled?: boolean | undefined;
    model?: string | undefined;
    debounceMs?: number | undefined;
    allowFrom?: string[] | undefined;
    cwd?: string | undefined;
}>, z.ZodObject<{
    id: z.ZodString;
    enabled: z.ZodDefault<z.ZodBoolean>;
    model: z.ZodOptional<z.ZodString>;
    debounceMs: z.ZodOptional<z.ZodNumber>;
    allowFrom: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    cwd: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"whatsapp">;
}, "strip", z.ZodTypeAny, {
    type: "whatsapp";
    id: string;
    enabled: boolean;
    model?: string | undefined;
    debounceMs?: number | undefined;
    allowFrom?: string[] | undefined;
    cwd?: string | undefined;
}, {
    type: "whatsapp";
    id: string;
    enabled?: boolean | undefined;
    model?: string | undefined;
    debounceMs?: number | undefined;
    allowFrom?: string[] | undefined;
    cwd?: string | undefined;
}>]>;
export type ChannelEntry = z.infer<typeof ChannelEntrySchema>;
export type TelegramChannel = z.infer<typeof TelegramChannelSchema>;
export type WhatsAppChannel = z.infer<typeof WhatsAppChannelSchema>;
/** Built-in channel type names — single source of truth, derived from the union above. */
export declare const CHANNEL_TYPES: [ChannelEntry["type"], ...ChannelEntry["type"][]];
//# sourceMappingURL=channels.d.ts.map