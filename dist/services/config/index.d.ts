import { z } from 'zod';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import { type ChannelEntry, type TelegramChannel, type WhatsAppChannel, type CronTask, type CronAddParams, type CronUpdateParams, type ProviderConfig, type Providers, type HeartbeatConfig, type WebhookEntry, type LinkExpandConfig, type McpClientConfig, type McpServerConfig, type StorageConfig, type Auth, type Json } from './schemas/index.js';
export declare const AppConfigSchema: z.ZodObject<{
    providers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
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
    }, z.ZodTypeAny, "passthrough">>>>;
    agent: z.ZodOptional<z.ZodObject<{
        lastChangelogVersion: z.ZodOptional<z.ZodString>;
        defaultThinkingLevel: z.ZodOptional<z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>>;
        steeringMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        followUpMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        theme: z.ZodOptional<z.ZodString>;
        compaction: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            reserveTokens: z.ZodOptional<z.ZodNumber>;
            keepRecentTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }>>;
        branchSummary: z.ZodOptional<z.ZodObject<{
            reserveTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            reserveTokens?: number | undefined;
        }, {
            reserveTokens?: number | undefined;
        }>>;
        retry: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            maxRetries: z.ZodOptional<z.ZodNumber>;
            baseDelayMs: z.ZodOptional<z.ZodNumber>;
            maxDelayMs: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }>>;
        hideThinkingBlock: z.ZodOptional<z.ZodBoolean>;
        shellPath: z.ZodOptional<z.ZodString>;
        quietStartup: z.ZodOptional<z.ZodBoolean>;
        shellCommandPrefix: z.ZodOptional<z.ZodString>;
        collapseChangelog: z.ZodOptional<z.ZodBoolean>;
        packages: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
            source: z.ZodString;
            extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }>]>, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        enableSkillCommands: z.ZodOptional<z.ZodBoolean>;
        terminal: z.ZodOptional<z.ZodObject<{
            showImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            showImages?: boolean | undefined;
        }, {
            showImages?: boolean | undefined;
        }>>;
        images: z.ZodOptional<z.ZodObject<{
            autoResize: z.ZodOptional<z.ZodBoolean>;
            blockImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }>>;
        enabledModels: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        doubleEscapeAction: z.ZodOptional<z.ZodEnum<["fork", "tree", "none"]>>;
        thinkingBudgets: z.ZodOptional<z.ZodObject<{
            minimal: z.ZodOptional<z.ZodNumber>;
            low: z.ZodOptional<z.ZodNumber>;
            medium: z.ZodOptional<z.ZodNumber>;
            high: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }>>;
        editorPaddingX: z.ZodOptional<z.ZodNumber>;
        autocompleteMaxVisible: z.ZodOptional<z.ZodNumber>;
        showHardwareCursor: z.ZodOptional<z.ZodBoolean>;
        markdown: z.ZodOptional<z.ZodObject<{
            codeBlockIndent: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            codeBlockIndent?: string | undefined;
        }, {
            codeBlockIndent?: string | undefined;
        }>>;
    } & {
        media: z.ZodOptional<z.ZodObject<{
            audio: z.ZodOptional<z.ZodString>;
            image: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            audio?: string | undefined;
            image?: string | undefined;
        }, {
            audio?: string | undefined;
            image?: string | undefined;
        }>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        lastChangelogVersion: z.ZodOptional<z.ZodString>;
        defaultThinkingLevel: z.ZodOptional<z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>>;
        steeringMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        followUpMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        theme: z.ZodOptional<z.ZodString>;
        compaction: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            reserveTokens: z.ZodOptional<z.ZodNumber>;
            keepRecentTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }>>;
        branchSummary: z.ZodOptional<z.ZodObject<{
            reserveTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            reserveTokens?: number | undefined;
        }, {
            reserveTokens?: number | undefined;
        }>>;
        retry: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            maxRetries: z.ZodOptional<z.ZodNumber>;
            baseDelayMs: z.ZodOptional<z.ZodNumber>;
            maxDelayMs: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }>>;
        hideThinkingBlock: z.ZodOptional<z.ZodBoolean>;
        shellPath: z.ZodOptional<z.ZodString>;
        quietStartup: z.ZodOptional<z.ZodBoolean>;
        shellCommandPrefix: z.ZodOptional<z.ZodString>;
        collapseChangelog: z.ZodOptional<z.ZodBoolean>;
        packages: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
            source: z.ZodString;
            extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }>]>, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        enableSkillCommands: z.ZodOptional<z.ZodBoolean>;
        terminal: z.ZodOptional<z.ZodObject<{
            showImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            showImages?: boolean | undefined;
        }, {
            showImages?: boolean | undefined;
        }>>;
        images: z.ZodOptional<z.ZodObject<{
            autoResize: z.ZodOptional<z.ZodBoolean>;
            blockImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }>>;
        enabledModels: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        doubleEscapeAction: z.ZodOptional<z.ZodEnum<["fork", "tree", "none"]>>;
        thinkingBudgets: z.ZodOptional<z.ZodObject<{
            minimal: z.ZodOptional<z.ZodNumber>;
            low: z.ZodOptional<z.ZodNumber>;
            medium: z.ZodOptional<z.ZodNumber>;
            high: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }>>;
        editorPaddingX: z.ZodOptional<z.ZodNumber>;
        autocompleteMaxVisible: z.ZodOptional<z.ZodNumber>;
        showHardwareCursor: z.ZodOptional<z.ZodBoolean>;
        markdown: z.ZodOptional<z.ZodObject<{
            codeBlockIndent: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            codeBlockIndent?: string | undefined;
        }, {
            codeBlockIndent?: string | undefined;
        }>>;
    } & {
        media: z.ZodOptional<z.ZodObject<{
            audio: z.ZodOptional<z.ZodString>;
            image: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            audio?: string | undefined;
            image?: string | undefined;
        }, {
            audio?: string | undefined;
            image?: string | undefined;
        }>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        lastChangelogVersion: z.ZodOptional<z.ZodString>;
        defaultThinkingLevel: z.ZodOptional<z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>>;
        steeringMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        followUpMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        theme: z.ZodOptional<z.ZodString>;
        compaction: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            reserveTokens: z.ZodOptional<z.ZodNumber>;
            keepRecentTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }>>;
        branchSummary: z.ZodOptional<z.ZodObject<{
            reserveTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            reserveTokens?: number | undefined;
        }, {
            reserveTokens?: number | undefined;
        }>>;
        retry: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            maxRetries: z.ZodOptional<z.ZodNumber>;
            baseDelayMs: z.ZodOptional<z.ZodNumber>;
            maxDelayMs: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }>>;
        hideThinkingBlock: z.ZodOptional<z.ZodBoolean>;
        shellPath: z.ZodOptional<z.ZodString>;
        quietStartup: z.ZodOptional<z.ZodBoolean>;
        shellCommandPrefix: z.ZodOptional<z.ZodString>;
        collapseChangelog: z.ZodOptional<z.ZodBoolean>;
        packages: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
            source: z.ZodString;
            extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }>]>, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        enableSkillCommands: z.ZodOptional<z.ZodBoolean>;
        terminal: z.ZodOptional<z.ZodObject<{
            showImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            showImages?: boolean | undefined;
        }, {
            showImages?: boolean | undefined;
        }>>;
        images: z.ZodOptional<z.ZodObject<{
            autoResize: z.ZodOptional<z.ZodBoolean>;
            blockImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }>>;
        enabledModels: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        doubleEscapeAction: z.ZodOptional<z.ZodEnum<["fork", "tree", "none"]>>;
        thinkingBudgets: z.ZodOptional<z.ZodObject<{
            minimal: z.ZodOptional<z.ZodNumber>;
            low: z.ZodOptional<z.ZodNumber>;
            medium: z.ZodOptional<z.ZodNumber>;
            high: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }>>;
        editorPaddingX: z.ZodOptional<z.ZodNumber>;
        autocompleteMaxVisible: z.ZodOptional<z.ZodNumber>;
        showHardwareCursor: z.ZodOptional<z.ZodBoolean>;
        markdown: z.ZodOptional<z.ZodObject<{
            codeBlockIndent: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            codeBlockIndent?: string | undefined;
        }, {
            codeBlockIndent?: string | undefined;
        }>>;
    } & {
        media: z.ZodOptional<z.ZodObject<{
            audio: z.ZodOptional<z.ZodString>;
            image: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            audio?: string | undefined;
            image?: string | undefined;
        }, {
            audio?: string | undefined;
            image?: string | undefined;
        }>>;
    }, z.ZodTypeAny, "passthrough">>>;
    auth: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
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
    channels: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
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
    }>]>, "many">>;
    cron: z.ZodOptional<z.ZodObject<{
        tasks: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        tasks?: {
            id: string;
            name: string;
            enabled: boolean;
            schedule: string;
            task: string;
            model?: string | undefined;
            notify?: string[] | undefined;
            activeHours?: number[] | undefined;
            activeHoursTimezone?: string | undefined;
        }[] | undefined;
    }, {
        tasks?: {
            id: string;
            name: string;
            schedule: string;
            task: string;
            enabled?: boolean | undefined;
            model?: string | undefined;
            notify?: string[] | undefined;
            activeHours?: number[] | undefined;
            activeHoursTimezone?: string | undefined;
        }[] | undefined;
    }>>;
    webhooks: z.ZodDefault<z.ZodArray<z.ZodObject<{
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
    }>, "many">>;
    heartbeat: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        intervalMinutes: z.ZodDefault<z.ZodNumber>;
        activeHours: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
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
    }>>;
    linkExpand: z.ZodDefault<z.ZodObject<{
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
    }>>;
    mcp: z.ZodDefault<z.ZodObject<{
        bearerToken: z.ZodOptional<z.ZodString>;
        host: z.ZodOptional<z.ZodString>;
        port: z.ZodOptional<z.ZodNumber>;
        endpoint: z.ZodOptional<z.ZodString>;
        transport: z.ZodOptional<z.ZodEnum<["http", "stdio"]>>;
    }, "strip", z.ZodTypeAny, {
        bearerToken?: string | undefined;
        host?: string | undefined;
        port?: number | undefined;
        endpoint?: string | undefined;
        transport?: "http" | "stdio" | undefined;
    }, {
        bearerToken?: string | undefined;
        host?: string | undefined;
        port?: number | undefined;
        endpoint?: string | undefined;
        transport?: "http" | "stdio" | undefined;
    }>>;
    mcpServers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    storage: z.ZodOptional<z.ZodObject<{
        type: z.ZodDefault<z.ZodEnum<["sqlite", "postgres"]>>;
        url: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "sqlite" | "postgres";
        url?: string | undefined;
    }, {
        type?: "sqlite" | "postgres" | undefined;
        url?: string | undefined;
    }>>;
    media: z.ZodOptional<z.ZodObject<{
        audio: z.ZodOptional<z.ZodString>;
        image: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        audio?: string | undefined;
        image?: string | undefined;
    }, {
        audio?: string | undefined;
        image?: string | undefined;
    }>>;
    paths: z.ZodDefault<z.ZodObject<{
        dataDir: z.ZodOptional<z.ZodString>;
        workspace: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        dataDir?: string | undefined;
        workspace?: string | undefined;
    }, {
        dataDir?: string | undefined;
        workspace?: string | undefined;
    }>>;
    gateway: z.ZodDefault<z.ZodObject<{
        host: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        port: z.ZodDefault<z.ZodNumber>;
        /** Client socket idle timeout (ms) for JSON-RPC connections */
        requestTimeout: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        host: string;
        port: number;
        requestTimeout?: number | undefined;
    }, {
        host?: string | undefined;
        port?: number | undefined;
        requestTimeout?: number | undefined;
    }>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    providers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
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
    }, z.ZodTypeAny, "passthrough">>>>;
    agent: z.ZodOptional<z.ZodObject<{
        lastChangelogVersion: z.ZodOptional<z.ZodString>;
        defaultThinkingLevel: z.ZodOptional<z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>>;
        steeringMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        followUpMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        theme: z.ZodOptional<z.ZodString>;
        compaction: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            reserveTokens: z.ZodOptional<z.ZodNumber>;
            keepRecentTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }>>;
        branchSummary: z.ZodOptional<z.ZodObject<{
            reserveTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            reserveTokens?: number | undefined;
        }, {
            reserveTokens?: number | undefined;
        }>>;
        retry: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            maxRetries: z.ZodOptional<z.ZodNumber>;
            baseDelayMs: z.ZodOptional<z.ZodNumber>;
            maxDelayMs: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }>>;
        hideThinkingBlock: z.ZodOptional<z.ZodBoolean>;
        shellPath: z.ZodOptional<z.ZodString>;
        quietStartup: z.ZodOptional<z.ZodBoolean>;
        shellCommandPrefix: z.ZodOptional<z.ZodString>;
        collapseChangelog: z.ZodOptional<z.ZodBoolean>;
        packages: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
            source: z.ZodString;
            extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }>]>, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        enableSkillCommands: z.ZodOptional<z.ZodBoolean>;
        terminal: z.ZodOptional<z.ZodObject<{
            showImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            showImages?: boolean | undefined;
        }, {
            showImages?: boolean | undefined;
        }>>;
        images: z.ZodOptional<z.ZodObject<{
            autoResize: z.ZodOptional<z.ZodBoolean>;
            blockImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }>>;
        enabledModels: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        doubleEscapeAction: z.ZodOptional<z.ZodEnum<["fork", "tree", "none"]>>;
        thinkingBudgets: z.ZodOptional<z.ZodObject<{
            minimal: z.ZodOptional<z.ZodNumber>;
            low: z.ZodOptional<z.ZodNumber>;
            medium: z.ZodOptional<z.ZodNumber>;
            high: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }>>;
        editorPaddingX: z.ZodOptional<z.ZodNumber>;
        autocompleteMaxVisible: z.ZodOptional<z.ZodNumber>;
        showHardwareCursor: z.ZodOptional<z.ZodBoolean>;
        markdown: z.ZodOptional<z.ZodObject<{
            codeBlockIndent: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            codeBlockIndent?: string | undefined;
        }, {
            codeBlockIndent?: string | undefined;
        }>>;
    } & {
        media: z.ZodOptional<z.ZodObject<{
            audio: z.ZodOptional<z.ZodString>;
            image: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            audio?: string | undefined;
            image?: string | undefined;
        }, {
            audio?: string | undefined;
            image?: string | undefined;
        }>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        lastChangelogVersion: z.ZodOptional<z.ZodString>;
        defaultThinkingLevel: z.ZodOptional<z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>>;
        steeringMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        followUpMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        theme: z.ZodOptional<z.ZodString>;
        compaction: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            reserveTokens: z.ZodOptional<z.ZodNumber>;
            keepRecentTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }>>;
        branchSummary: z.ZodOptional<z.ZodObject<{
            reserveTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            reserveTokens?: number | undefined;
        }, {
            reserveTokens?: number | undefined;
        }>>;
        retry: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            maxRetries: z.ZodOptional<z.ZodNumber>;
            baseDelayMs: z.ZodOptional<z.ZodNumber>;
            maxDelayMs: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }>>;
        hideThinkingBlock: z.ZodOptional<z.ZodBoolean>;
        shellPath: z.ZodOptional<z.ZodString>;
        quietStartup: z.ZodOptional<z.ZodBoolean>;
        shellCommandPrefix: z.ZodOptional<z.ZodString>;
        collapseChangelog: z.ZodOptional<z.ZodBoolean>;
        packages: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
            source: z.ZodString;
            extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }>]>, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        enableSkillCommands: z.ZodOptional<z.ZodBoolean>;
        terminal: z.ZodOptional<z.ZodObject<{
            showImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            showImages?: boolean | undefined;
        }, {
            showImages?: boolean | undefined;
        }>>;
        images: z.ZodOptional<z.ZodObject<{
            autoResize: z.ZodOptional<z.ZodBoolean>;
            blockImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }>>;
        enabledModels: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        doubleEscapeAction: z.ZodOptional<z.ZodEnum<["fork", "tree", "none"]>>;
        thinkingBudgets: z.ZodOptional<z.ZodObject<{
            minimal: z.ZodOptional<z.ZodNumber>;
            low: z.ZodOptional<z.ZodNumber>;
            medium: z.ZodOptional<z.ZodNumber>;
            high: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }>>;
        editorPaddingX: z.ZodOptional<z.ZodNumber>;
        autocompleteMaxVisible: z.ZodOptional<z.ZodNumber>;
        showHardwareCursor: z.ZodOptional<z.ZodBoolean>;
        markdown: z.ZodOptional<z.ZodObject<{
            codeBlockIndent: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            codeBlockIndent?: string | undefined;
        }, {
            codeBlockIndent?: string | undefined;
        }>>;
    } & {
        media: z.ZodOptional<z.ZodObject<{
            audio: z.ZodOptional<z.ZodString>;
            image: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            audio?: string | undefined;
            image?: string | undefined;
        }, {
            audio?: string | undefined;
            image?: string | undefined;
        }>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        lastChangelogVersion: z.ZodOptional<z.ZodString>;
        defaultThinkingLevel: z.ZodOptional<z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>>;
        steeringMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        followUpMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        theme: z.ZodOptional<z.ZodString>;
        compaction: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            reserveTokens: z.ZodOptional<z.ZodNumber>;
            keepRecentTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }>>;
        branchSummary: z.ZodOptional<z.ZodObject<{
            reserveTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            reserveTokens?: number | undefined;
        }, {
            reserveTokens?: number | undefined;
        }>>;
        retry: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            maxRetries: z.ZodOptional<z.ZodNumber>;
            baseDelayMs: z.ZodOptional<z.ZodNumber>;
            maxDelayMs: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }>>;
        hideThinkingBlock: z.ZodOptional<z.ZodBoolean>;
        shellPath: z.ZodOptional<z.ZodString>;
        quietStartup: z.ZodOptional<z.ZodBoolean>;
        shellCommandPrefix: z.ZodOptional<z.ZodString>;
        collapseChangelog: z.ZodOptional<z.ZodBoolean>;
        packages: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
            source: z.ZodString;
            extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }>]>, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        enableSkillCommands: z.ZodOptional<z.ZodBoolean>;
        terminal: z.ZodOptional<z.ZodObject<{
            showImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            showImages?: boolean | undefined;
        }, {
            showImages?: boolean | undefined;
        }>>;
        images: z.ZodOptional<z.ZodObject<{
            autoResize: z.ZodOptional<z.ZodBoolean>;
            blockImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }>>;
        enabledModels: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        doubleEscapeAction: z.ZodOptional<z.ZodEnum<["fork", "tree", "none"]>>;
        thinkingBudgets: z.ZodOptional<z.ZodObject<{
            minimal: z.ZodOptional<z.ZodNumber>;
            low: z.ZodOptional<z.ZodNumber>;
            medium: z.ZodOptional<z.ZodNumber>;
            high: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }>>;
        editorPaddingX: z.ZodOptional<z.ZodNumber>;
        autocompleteMaxVisible: z.ZodOptional<z.ZodNumber>;
        showHardwareCursor: z.ZodOptional<z.ZodBoolean>;
        markdown: z.ZodOptional<z.ZodObject<{
            codeBlockIndent: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            codeBlockIndent?: string | undefined;
        }, {
            codeBlockIndent?: string | undefined;
        }>>;
    } & {
        media: z.ZodOptional<z.ZodObject<{
            audio: z.ZodOptional<z.ZodString>;
            image: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            audio?: string | undefined;
            image?: string | undefined;
        }, {
            audio?: string | undefined;
            image?: string | undefined;
        }>>;
    }, z.ZodTypeAny, "passthrough">>>;
    auth: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
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
    channels: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
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
    }>]>, "many">>;
    cron: z.ZodOptional<z.ZodObject<{
        tasks: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        tasks?: {
            id: string;
            name: string;
            enabled: boolean;
            schedule: string;
            task: string;
            model?: string | undefined;
            notify?: string[] | undefined;
            activeHours?: number[] | undefined;
            activeHoursTimezone?: string | undefined;
        }[] | undefined;
    }, {
        tasks?: {
            id: string;
            name: string;
            schedule: string;
            task: string;
            enabled?: boolean | undefined;
            model?: string | undefined;
            notify?: string[] | undefined;
            activeHours?: number[] | undefined;
            activeHoursTimezone?: string | undefined;
        }[] | undefined;
    }>>;
    webhooks: z.ZodDefault<z.ZodArray<z.ZodObject<{
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
    }>, "many">>;
    heartbeat: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        intervalMinutes: z.ZodDefault<z.ZodNumber>;
        activeHours: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
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
    }>>;
    linkExpand: z.ZodDefault<z.ZodObject<{
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
    }>>;
    mcp: z.ZodDefault<z.ZodObject<{
        bearerToken: z.ZodOptional<z.ZodString>;
        host: z.ZodOptional<z.ZodString>;
        port: z.ZodOptional<z.ZodNumber>;
        endpoint: z.ZodOptional<z.ZodString>;
        transport: z.ZodOptional<z.ZodEnum<["http", "stdio"]>>;
    }, "strip", z.ZodTypeAny, {
        bearerToken?: string | undefined;
        host?: string | undefined;
        port?: number | undefined;
        endpoint?: string | undefined;
        transport?: "http" | "stdio" | undefined;
    }, {
        bearerToken?: string | undefined;
        host?: string | undefined;
        port?: number | undefined;
        endpoint?: string | undefined;
        transport?: "http" | "stdio" | undefined;
    }>>;
    mcpServers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    storage: z.ZodOptional<z.ZodObject<{
        type: z.ZodDefault<z.ZodEnum<["sqlite", "postgres"]>>;
        url: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "sqlite" | "postgres";
        url?: string | undefined;
    }, {
        type?: "sqlite" | "postgres" | undefined;
        url?: string | undefined;
    }>>;
    media: z.ZodOptional<z.ZodObject<{
        audio: z.ZodOptional<z.ZodString>;
        image: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        audio?: string | undefined;
        image?: string | undefined;
    }, {
        audio?: string | undefined;
        image?: string | undefined;
    }>>;
    paths: z.ZodDefault<z.ZodObject<{
        dataDir: z.ZodOptional<z.ZodString>;
        workspace: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        dataDir?: string | undefined;
        workspace?: string | undefined;
    }, {
        dataDir?: string | undefined;
        workspace?: string | undefined;
    }>>;
    gateway: z.ZodDefault<z.ZodObject<{
        host: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        port: z.ZodDefault<z.ZodNumber>;
        /** Client socket idle timeout (ms) for JSON-RPC connections */
        requestTimeout: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        host: string;
        port: number;
        requestTimeout?: number | undefined;
    }, {
        host?: string | undefined;
        port?: number | undefined;
        requestTimeout?: number | undefined;
    }>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    providers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
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
    }, z.ZodTypeAny, "passthrough">>>>;
    agent: z.ZodOptional<z.ZodObject<{
        lastChangelogVersion: z.ZodOptional<z.ZodString>;
        defaultThinkingLevel: z.ZodOptional<z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>>;
        steeringMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        followUpMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        theme: z.ZodOptional<z.ZodString>;
        compaction: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            reserveTokens: z.ZodOptional<z.ZodNumber>;
            keepRecentTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }>>;
        branchSummary: z.ZodOptional<z.ZodObject<{
            reserveTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            reserveTokens?: number | undefined;
        }, {
            reserveTokens?: number | undefined;
        }>>;
        retry: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            maxRetries: z.ZodOptional<z.ZodNumber>;
            baseDelayMs: z.ZodOptional<z.ZodNumber>;
            maxDelayMs: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }>>;
        hideThinkingBlock: z.ZodOptional<z.ZodBoolean>;
        shellPath: z.ZodOptional<z.ZodString>;
        quietStartup: z.ZodOptional<z.ZodBoolean>;
        shellCommandPrefix: z.ZodOptional<z.ZodString>;
        collapseChangelog: z.ZodOptional<z.ZodBoolean>;
        packages: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
            source: z.ZodString;
            extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }>]>, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        enableSkillCommands: z.ZodOptional<z.ZodBoolean>;
        terminal: z.ZodOptional<z.ZodObject<{
            showImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            showImages?: boolean | undefined;
        }, {
            showImages?: boolean | undefined;
        }>>;
        images: z.ZodOptional<z.ZodObject<{
            autoResize: z.ZodOptional<z.ZodBoolean>;
            blockImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }>>;
        enabledModels: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        doubleEscapeAction: z.ZodOptional<z.ZodEnum<["fork", "tree", "none"]>>;
        thinkingBudgets: z.ZodOptional<z.ZodObject<{
            minimal: z.ZodOptional<z.ZodNumber>;
            low: z.ZodOptional<z.ZodNumber>;
            medium: z.ZodOptional<z.ZodNumber>;
            high: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }>>;
        editorPaddingX: z.ZodOptional<z.ZodNumber>;
        autocompleteMaxVisible: z.ZodOptional<z.ZodNumber>;
        showHardwareCursor: z.ZodOptional<z.ZodBoolean>;
        markdown: z.ZodOptional<z.ZodObject<{
            codeBlockIndent: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            codeBlockIndent?: string | undefined;
        }, {
            codeBlockIndent?: string | undefined;
        }>>;
    } & {
        media: z.ZodOptional<z.ZodObject<{
            audio: z.ZodOptional<z.ZodString>;
            image: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            audio?: string | undefined;
            image?: string | undefined;
        }, {
            audio?: string | undefined;
            image?: string | undefined;
        }>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        lastChangelogVersion: z.ZodOptional<z.ZodString>;
        defaultThinkingLevel: z.ZodOptional<z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>>;
        steeringMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        followUpMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        theme: z.ZodOptional<z.ZodString>;
        compaction: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            reserveTokens: z.ZodOptional<z.ZodNumber>;
            keepRecentTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }>>;
        branchSummary: z.ZodOptional<z.ZodObject<{
            reserveTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            reserveTokens?: number | undefined;
        }, {
            reserveTokens?: number | undefined;
        }>>;
        retry: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            maxRetries: z.ZodOptional<z.ZodNumber>;
            baseDelayMs: z.ZodOptional<z.ZodNumber>;
            maxDelayMs: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }>>;
        hideThinkingBlock: z.ZodOptional<z.ZodBoolean>;
        shellPath: z.ZodOptional<z.ZodString>;
        quietStartup: z.ZodOptional<z.ZodBoolean>;
        shellCommandPrefix: z.ZodOptional<z.ZodString>;
        collapseChangelog: z.ZodOptional<z.ZodBoolean>;
        packages: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
            source: z.ZodString;
            extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }>]>, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        enableSkillCommands: z.ZodOptional<z.ZodBoolean>;
        terminal: z.ZodOptional<z.ZodObject<{
            showImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            showImages?: boolean | undefined;
        }, {
            showImages?: boolean | undefined;
        }>>;
        images: z.ZodOptional<z.ZodObject<{
            autoResize: z.ZodOptional<z.ZodBoolean>;
            blockImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }>>;
        enabledModels: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        doubleEscapeAction: z.ZodOptional<z.ZodEnum<["fork", "tree", "none"]>>;
        thinkingBudgets: z.ZodOptional<z.ZodObject<{
            minimal: z.ZodOptional<z.ZodNumber>;
            low: z.ZodOptional<z.ZodNumber>;
            medium: z.ZodOptional<z.ZodNumber>;
            high: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }>>;
        editorPaddingX: z.ZodOptional<z.ZodNumber>;
        autocompleteMaxVisible: z.ZodOptional<z.ZodNumber>;
        showHardwareCursor: z.ZodOptional<z.ZodBoolean>;
        markdown: z.ZodOptional<z.ZodObject<{
            codeBlockIndent: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            codeBlockIndent?: string | undefined;
        }, {
            codeBlockIndent?: string | undefined;
        }>>;
    } & {
        media: z.ZodOptional<z.ZodObject<{
            audio: z.ZodOptional<z.ZodString>;
            image: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            audio?: string | undefined;
            image?: string | undefined;
        }, {
            audio?: string | undefined;
            image?: string | undefined;
        }>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        lastChangelogVersion: z.ZodOptional<z.ZodString>;
        defaultThinkingLevel: z.ZodOptional<z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>>;
        steeringMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        followUpMode: z.ZodOptional<z.ZodEnum<["all", "one-at-a-time"]>>;
        theme: z.ZodOptional<z.ZodString>;
        compaction: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            reserveTokens: z.ZodOptional<z.ZodNumber>;
            keepRecentTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            reserveTokens?: number | undefined;
            keepRecentTokens?: number | undefined;
        }>>;
        branchSummary: z.ZodOptional<z.ZodObject<{
            reserveTokens: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            reserveTokens?: number | undefined;
        }, {
            reserveTokens?: number | undefined;
        }>>;
        retry: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            maxRetries: z.ZodOptional<z.ZodNumber>;
            baseDelayMs: z.ZodOptional<z.ZodNumber>;
            maxDelayMs: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            maxRetries?: number | undefined;
            baseDelayMs?: number | undefined;
            maxDelayMs?: number | undefined;
        }>>;
        hideThinkingBlock: z.ZodOptional<z.ZodBoolean>;
        shellPath: z.ZodOptional<z.ZodString>;
        quietStartup: z.ZodOptional<z.ZodBoolean>;
        shellCommandPrefix: z.ZodOptional<z.ZodString>;
        collapseChangelog: z.ZodOptional<z.ZodBoolean>;
        packages: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
            source: z.ZodString;
            extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }, {
            source: string;
            extensions?: string[] | undefined;
            skills?: string[] | undefined;
            prompts?: string[] | undefined;
            themes?: string[] | undefined;
        }>]>, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        prompts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        themes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        enableSkillCommands: z.ZodOptional<z.ZodBoolean>;
        terminal: z.ZodOptional<z.ZodObject<{
            showImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            showImages?: boolean | undefined;
        }, {
            showImages?: boolean | undefined;
        }>>;
        images: z.ZodOptional<z.ZodObject<{
            autoResize: z.ZodOptional<z.ZodBoolean>;
            blockImages: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }, {
            autoResize?: boolean | undefined;
            blockImages?: boolean | undefined;
        }>>;
        enabledModels: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        doubleEscapeAction: z.ZodOptional<z.ZodEnum<["fork", "tree", "none"]>>;
        thinkingBudgets: z.ZodOptional<z.ZodObject<{
            minimal: z.ZodOptional<z.ZodNumber>;
            low: z.ZodOptional<z.ZodNumber>;
            medium: z.ZodOptional<z.ZodNumber>;
            high: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }, {
            minimal?: number | undefined;
            low?: number | undefined;
            medium?: number | undefined;
            high?: number | undefined;
        }>>;
        editorPaddingX: z.ZodOptional<z.ZodNumber>;
        autocompleteMaxVisible: z.ZodOptional<z.ZodNumber>;
        showHardwareCursor: z.ZodOptional<z.ZodBoolean>;
        markdown: z.ZodOptional<z.ZodObject<{
            codeBlockIndent: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            codeBlockIndent?: string | undefined;
        }, {
            codeBlockIndent?: string | undefined;
        }>>;
    } & {
        media: z.ZodOptional<z.ZodObject<{
            audio: z.ZodOptional<z.ZodString>;
            image: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            audio?: string | undefined;
            image?: string | undefined;
        }, {
            audio?: string | undefined;
            image?: string | undefined;
        }>>;
    }, z.ZodTypeAny, "passthrough">>>;
    auth: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
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
    channels: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
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
    }>]>, "many">>;
    cron: z.ZodOptional<z.ZodObject<{
        tasks: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        tasks?: {
            id: string;
            name: string;
            enabled: boolean;
            schedule: string;
            task: string;
            model?: string | undefined;
            notify?: string[] | undefined;
            activeHours?: number[] | undefined;
            activeHoursTimezone?: string | undefined;
        }[] | undefined;
    }, {
        tasks?: {
            id: string;
            name: string;
            schedule: string;
            task: string;
            enabled?: boolean | undefined;
            model?: string | undefined;
            notify?: string[] | undefined;
            activeHours?: number[] | undefined;
            activeHoursTimezone?: string | undefined;
        }[] | undefined;
    }>>;
    webhooks: z.ZodDefault<z.ZodArray<z.ZodObject<{
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
    }>, "many">>;
    heartbeat: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        intervalMinutes: z.ZodDefault<z.ZodNumber>;
        activeHours: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
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
    }>>;
    linkExpand: z.ZodDefault<z.ZodObject<{
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
    }>>;
    mcp: z.ZodDefault<z.ZodObject<{
        bearerToken: z.ZodOptional<z.ZodString>;
        host: z.ZodOptional<z.ZodString>;
        port: z.ZodOptional<z.ZodNumber>;
        endpoint: z.ZodOptional<z.ZodString>;
        transport: z.ZodOptional<z.ZodEnum<["http", "stdio"]>>;
    }, "strip", z.ZodTypeAny, {
        bearerToken?: string | undefined;
        host?: string | undefined;
        port?: number | undefined;
        endpoint?: string | undefined;
        transport?: "http" | "stdio" | undefined;
    }, {
        bearerToken?: string | undefined;
        host?: string | undefined;
        port?: number | undefined;
        endpoint?: string | undefined;
        transport?: "http" | "stdio" | undefined;
    }>>;
    mcpServers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    storage: z.ZodOptional<z.ZodObject<{
        type: z.ZodDefault<z.ZodEnum<["sqlite", "postgres"]>>;
        url: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "sqlite" | "postgres";
        url?: string | undefined;
    }, {
        type?: "sqlite" | "postgres" | undefined;
        url?: string | undefined;
    }>>;
    media: z.ZodOptional<z.ZodObject<{
        audio: z.ZodOptional<z.ZodString>;
        image: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        audio?: string | undefined;
        image?: string | undefined;
    }, {
        audio?: string | undefined;
        image?: string | undefined;
    }>>;
    paths: z.ZodDefault<z.ZodObject<{
        dataDir: z.ZodOptional<z.ZodString>;
        workspace: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        dataDir?: string | undefined;
        workspace?: string | undefined;
    }, {
        dataDir?: string | undefined;
        workspace?: string | undefined;
    }>>;
    gateway: z.ZodDefault<z.ZodObject<{
        host: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        port: z.ZodDefault<z.ZodNumber>;
        /** Client socket idle timeout (ms) for JSON-RPC connections */
        requestTimeout: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        host: string;
        port: number;
        requestTimeout?: number | undefined;
    }, {
        host?: string | undefined;
        port?: number | undefined;
        requestTimeout?: number | undefined;
    }>>;
}, z.ZodTypeAny, "passthrough">>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
export type { ChannelEntry, TelegramChannel, WhatsAppChannel, CronTask, CronAddParams, CronUpdateParams, ProviderConfig, Providers, Auth, HeartbeatConfig, WebhookEntry, LinkExpandConfig, McpClientConfig, McpServerConfig, StorageConfig, Json, };
export declare function saveConfig(path: string, config: AppConfig): void;
export declare class ConfigService {
    private readonly bus;
    private readonly log;
    private readonly configFile;
    private readonly agentDir;
    private readonly agentModelsFile;
    private readonly agentSettingsFile;
    private readonly agentAuthFile;
    constructor(bus: Bus);
    private loadConfig;
    get(_params: EventMap['config.get']['params']): Promise<AppConfig>;
    set(params: AppConfig): Promise<AppConfig>;
}
export declare function boot(bus: Bus): Promise<{
    stop?(): void;
}>;
export * from './schemas/index.js';
//# sourceMappingURL=index.d.ts.map