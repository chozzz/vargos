/**
 * Provider configuration schemas (from ~/.vargos/agent/models.json)
 *
 * Providers include baseUrl, API type, and registry of available models with cost/capability info.
 */
import { z } from 'zod';
export declare const ProviderConfigSchema: z.ZodObject<{
    baseUrl: z.ZodString;
    api: z.ZodDefault<z.ZodString>;
    apiKey: z.ZodOptional<z.ZodString>;
    models: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        reasoning: z.ZodOptional<z.ZodBoolean>;
        input: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        }, {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        }>>;
        contextWindow: z.ZodOptional<z.ZodNumber>;
        maxTokens: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        reasoning?: boolean | undefined;
        input?: string[] | undefined;
        cost?: {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        } | undefined;
        contextWindow?: number | undefined;
        maxTokens?: number | undefined;
    }, {
        id: string;
        name: string;
        reasoning?: boolean | undefined;
        input?: string[] | undefined;
        cost?: {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        } | undefined;
        contextWindow?: number | undefined;
        maxTokens?: number | undefined;
    }>, "many">>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    baseUrl: z.ZodString;
    api: z.ZodDefault<z.ZodString>;
    apiKey: z.ZodOptional<z.ZodString>;
    models: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        reasoning: z.ZodOptional<z.ZodBoolean>;
        input: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        }, {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        }>>;
        contextWindow: z.ZodOptional<z.ZodNumber>;
        maxTokens: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        reasoning?: boolean | undefined;
        input?: string[] | undefined;
        cost?: {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        } | undefined;
        contextWindow?: number | undefined;
        maxTokens?: number | undefined;
    }, {
        id: string;
        name: string;
        reasoning?: boolean | undefined;
        input?: string[] | undefined;
        cost?: {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        } | undefined;
        contextWindow?: number | undefined;
        maxTokens?: number | undefined;
    }>, "many">>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    baseUrl: z.ZodString;
    api: z.ZodDefault<z.ZodString>;
    apiKey: z.ZodOptional<z.ZodString>;
    models: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        reasoning: z.ZodOptional<z.ZodBoolean>;
        input: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        }, {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        }>>;
        contextWindow: z.ZodOptional<z.ZodNumber>;
        maxTokens: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        reasoning?: boolean | undefined;
        input?: string[] | undefined;
        cost?: {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        } | undefined;
        contextWindow?: number | undefined;
        maxTokens?: number | undefined;
    }, {
        id: string;
        name: string;
        reasoning?: boolean | undefined;
        input?: string[] | undefined;
        cost?: {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        } | undefined;
        contextWindow?: number | undefined;
        maxTokens?: number | undefined;
    }>, "many">>;
}, z.ZodTypeAny, "passthrough">>;
export declare const ProvidersSchema: z.ZodRecord<z.ZodString, z.ZodObject<{
    baseUrl: z.ZodString;
    api: z.ZodDefault<z.ZodString>;
    apiKey: z.ZodOptional<z.ZodString>;
    models: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        reasoning: z.ZodOptional<z.ZodBoolean>;
        input: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        }, {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        }>>;
        contextWindow: z.ZodOptional<z.ZodNumber>;
        maxTokens: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        reasoning?: boolean | undefined;
        input?: string[] | undefined;
        cost?: {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        } | undefined;
        contextWindow?: number | undefined;
        maxTokens?: number | undefined;
    }, {
        id: string;
        name: string;
        reasoning?: boolean | undefined;
        input?: string[] | undefined;
        cost?: {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        } | undefined;
        contextWindow?: number | undefined;
        maxTokens?: number | undefined;
    }>, "many">>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    baseUrl: z.ZodString;
    api: z.ZodDefault<z.ZodString>;
    apiKey: z.ZodOptional<z.ZodString>;
    models: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        reasoning: z.ZodOptional<z.ZodBoolean>;
        input: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        }, {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        }>>;
        contextWindow: z.ZodOptional<z.ZodNumber>;
        maxTokens: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        reasoning?: boolean | undefined;
        input?: string[] | undefined;
        cost?: {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        } | undefined;
        contextWindow?: number | undefined;
        maxTokens?: number | undefined;
    }, {
        id: string;
        name: string;
        reasoning?: boolean | undefined;
        input?: string[] | undefined;
        cost?: {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        } | undefined;
        contextWindow?: number | undefined;
        maxTokens?: number | undefined;
    }>, "many">>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    baseUrl: z.ZodString;
    api: z.ZodDefault<z.ZodString>;
    apiKey: z.ZodOptional<z.ZodString>;
    models: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        reasoning: z.ZodOptional<z.ZodBoolean>;
        input: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        cost: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
            cacheRead: z.ZodOptional<z.ZodNumber>;
            cacheWrite: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        }, {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        }>>;
        contextWindow: z.ZodOptional<z.ZodNumber>;
        maxTokens: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        reasoning?: boolean | undefined;
        input?: string[] | undefined;
        cost?: {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        } | undefined;
        contextWindow?: number | undefined;
        maxTokens?: number | undefined;
    }, {
        id: string;
        name: string;
        reasoning?: boolean | undefined;
        input?: string[] | undefined;
        cost?: {
            input: number;
            output: number;
            cacheRead?: number | undefined;
            cacheWrite?: number | undefined;
        } | undefined;
        contextWindow?: number | undefined;
        maxTokens?: number | undefined;
    }>, "many">>;
}, z.ZodTypeAny, "passthrough">>>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type Providers = z.infer<typeof ProvidersSchema>;
//# sourceMappingURL=providers.d.ts.map