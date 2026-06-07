/**
 * Agent configuration schemas
 *
 * Combines Vargos-specific fields with PiAgent's Settings from ~/.vargos/agent/settings.json
 * See @earendil-works/pi-coding-agent SettingsManager for full field list.
 */
import { z } from 'zod';
export declare const CompactionSettingsSchema: z.ZodOptional<z.ZodObject<{
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
export declare const BranchSummarySettingsSchema: z.ZodOptional<z.ZodObject<{
    reserveTokens: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    reserveTokens?: number | undefined;
}, {
    reserveTokens?: number | undefined;
}>>;
export declare const RetrySettingsSchema: z.ZodOptional<z.ZodObject<{
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
export declare const TerminalSettingsSchema: z.ZodOptional<z.ZodObject<{
    showImages: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    showImages?: boolean | undefined;
}, {
    showImages?: boolean | undefined;
}>>;
export declare const ImageSettingsSchema: z.ZodOptional<z.ZodObject<{
    autoResize: z.ZodOptional<z.ZodBoolean>;
    blockImages: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    autoResize?: boolean | undefined;
    blockImages?: boolean | undefined;
}, {
    autoResize?: boolean | undefined;
    blockImages?: boolean | undefined;
}>>;
export declare const ThinkingBudgetsSettingsSchema: z.ZodOptional<z.ZodObject<{
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
export declare const MarkdownSettingsSchema: z.ZodOptional<z.ZodObject<{
    codeBlockIndent: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    codeBlockIndent?: string | undefined;
}, {
    codeBlockIndent?: string | undefined;
}>>;
export declare const PackageSourceSchema: z.ZodUnion<[z.ZodString, z.ZodObject<{
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
}>]>;
export declare const PiAgentSettingsSchema: z.ZodObject<{
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
}, "strict", z.ZodTypeAny, {
    extensions?: string[] | undefined;
    skills?: string[] | undefined;
    prompts?: string[] | undefined;
    themes?: string[] | undefined;
    lastChangelogVersion?: string | undefined;
    defaultThinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined;
    steeringMode?: "all" | "one-at-a-time" | undefined;
    followUpMode?: "all" | "one-at-a-time" | undefined;
    theme?: string | undefined;
    compaction?: {
        enabled?: boolean | undefined;
        reserveTokens?: number | undefined;
        keepRecentTokens?: number | undefined;
    } | undefined;
    branchSummary?: {
        reserveTokens?: number | undefined;
    } | undefined;
    retry?: {
        enabled?: boolean | undefined;
        maxRetries?: number | undefined;
        baseDelayMs?: number | undefined;
        maxDelayMs?: number | undefined;
    } | undefined;
    hideThinkingBlock?: boolean | undefined;
    shellPath?: string | undefined;
    quietStartup?: boolean | undefined;
    shellCommandPrefix?: string | undefined;
    collapseChangelog?: boolean | undefined;
    packages?: (string | {
        source: string;
        extensions?: string[] | undefined;
        skills?: string[] | undefined;
        prompts?: string[] | undefined;
        themes?: string[] | undefined;
    })[] | undefined;
    enableSkillCommands?: boolean | undefined;
    terminal?: {
        showImages?: boolean | undefined;
    } | undefined;
    images?: {
        autoResize?: boolean | undefined;
        blockImages?: boolean | undefined;
    } | undefined;
    enabledModels?: string[] | undefined;
    doubleEscapeAction?: "fork" | "tree" | "none" | undefined;
    thinkingBudgets?: {
        minimal?: number | undefined;
        low?: number | undefined;
        medium?: number | undefined;
        high?: number | undefined;
    } | undefined;
    editorPaddingX?: number | undefined;
    autocompleteMaxVisible?: number | undefined;
    showHardwareCursor?: boolean | undefined;
    markdown?: {
        codeBlockIndent?: string | undefined;
    } | undefined;
}, {
    extensions?: string[] | undefined;
    skills?: string[] | undefined;
    prompts?: string[] | undefined;
    themes?: string[] | undefined;
    lastChangelogVersion?: string | undefined;
    defaultThinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined;
    steeringMode?: "all" | "one-at-a-time" | undefined;
    followUpMode?: "all" | "one-at-a-time" | undefined;
    theme?: string | undefined;
    compaction?: {
        enabled?: boolean | undefined;
        reserveTokens?: number | undefined;
        keepRecentTokens?: number | undefined;
    } | undefined;
    branchSummary?: {
        reserveTokens?: number | undefined;
    } | undefined;
    retry?: {
        enabled?: boolean | undefined;
        maxRetries?: number | undefined;
        baseDelayMs?: number | undefined;
        maxDelayMs?: number | undefined;
    } | undefined;
    hideThinkingBlock?: boolean | undefined;
    shellPath?: string | undefined;
    quietStartup?: boolean | undefined;
    shellCommandPrefix?: string | undefined;
    collapseChangelog?: boolean | undefined;
    packages?: (string | {
        source: string;
        extensions?: string[] | undefined;
        skills?: string[] | undefined;
        prompts?: string[] | undefined;
        themes?: string[] | undefined;
    })[] | undefined;
    enableSkillCommands?: boolean | undefined;
    terminal?: {
        showImages?: boolean | undefined;
    } | undefined;
    images?: {
        autoResize?: boolean | undefined;
        blockImages?: boolean | undefined;
    } | undefined;
    enabledModels?: string[] | undefined;
    doubleEscapeAction?: "fork" | "tree" | "none" | undefined;
    thinkingBudgets?: {
        minimal?: number | undefined;
        low?: number | undefined;
        medium?: number | undefined;
        high?: number | undefined;
    } | undefined;
    editorPaddingX?: number | undefined;
    autocompleteMaxVisible?: number | undefined;
    showHardwareCursor?: boolean | undefined;
    markdown?: {
        codeBlockIndent?: string | undefined;
    } | undefined;
}>;
export type PiAgentSettings = z.infer<typeof PiAgentSettingsSchema>;
export declare const AgentConfigSchema: z.ZodObject<{
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
}, z.ZodTypeAny, "passthrough">>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
//# sourceMappingURL=agent.d.ts.map