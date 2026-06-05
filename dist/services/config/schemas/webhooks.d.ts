/**
 * Webhook configuration schemas
 */
import { z } from 'zod';
export declare const WebhookEntrySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    token: z.ZodString;
    transform: z.ZodOptional<z.ZodString>;
    notify: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    token: string;
    notify?: string[] | undefined;
    transform?: string | undefined;
}, {
    id: string;
    name: string;
    token: string;
    notify?: string[] | undefined;
    transform?: string | undefined;
}>;
export type WebhookEntry = z.infer<typeof WebhookEntrySchema>;
//# sourceMappingURL=webhooks.d.ts.map