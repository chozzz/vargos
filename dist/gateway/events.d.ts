export type { ThinkingLevel, ChannelEntry, CronTask, CronAddParams, CronUpdateParams, WebhookEntry, Json, AppConfig } from '../services/config/index.js';
import type { ChannelEntry, CronTask, CronAddParams, CronUpdateParams, WebhookEntry, Json, AppConfig } from '../services/config/index.js';
export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Pagination<T> = {
    items: T[];
    page: number;
    limit: number;
};
export interface ChannelInfo {
    instanceId: string;
    type: string;
    status: ChannelStatus;
}
export interface ErrorEntry {
    service: string;
    error: string;
    context?: Json;
    timestamp: number;
}
export interface MemorySearchResult {
    citation: string;
    score: number;
    content: string;
    startLine: number;
    endLine: number;
}
export interface EventMetadata {
    event: string;
    description: string;
    type: 'handler' | 'tool';
    schema?: {
        params?: unknown;
        result?: unknown;
    };
}
export interface AgentExecuteParams {
    /** Session key — required for direct callers (channels, cron, webhooks, TCP).
     *  When the agent calls agent.execute as a tool, wrapEventAsToolDefinition injects this automatically. */
    sessionKey: string;
    /** The task to execute or delegate to the agent. */
    task: string;
    /** Working directory for the agent — defaults to workspace dir.
     * When set, bootstrap files from both cwd and workspace are merged. */
    cwd?: string;
    /** Model override in format `provider:modelId` (e.g., "claude-opus-4").
     * Overrides the channel's model config and the agent's default model. */
    model?: string;
}
export interface AgentAppendMessageParams {
    sessionKey: string;
    content: string;
}
export interface EventMap {
    /** Structured log line — LogService subscribes and handles output + persistence. */
    'log.onLog': {
        level: LogLevel;
        service: string;
        message: string;
        data?: Json;
    };
    /** Streaming LLM chunk from an active agent run. */
    'agent.onDelta': {
        sessionKey: string;
        chunk: string;
    };
    /** Tool lifecycle within a run. */
    'agent.onTool': ({
        sessionKey: string;
        toolName: string;
        phase: 'start';
        args: Json;
    } | {
        sessionKey: string;
        toolName: string;
        phase: 'end';
        result: Json;
    });
    /** Run finished (success or failure). */
    'agent.onCompleted': ({
        sessionKey: string;
        success: true;
        response: string;
    } | {
        sessionKey: string;
        success: false;
        error: string;
    });
    'channel.onConnected': {
        instanceId: string;
        type: string;
    };
    'channel.onDisconnected': {
        instanceId: string;
    };
    /** Emitted after all services are registered — signals boot completion. Deferred startup can proceed. */
    'bus.onReady': Record<string, never>;
    'config.get': {
        params: Record<string, never>;
        result: AppConfig;
    };
    'config.set': {
        params: AppConfig;
        result: AppConfig;
    };
    'agent.execute': {
        params: AgentExecuteParams;
        result: {
            response: string;
        };
    };
    'agent.appendMessage': {
        params: AgentAppendMessageParams;
        result: void;
    };
    'agent.status': {
        params: {
            sessionKey?: string;
        };
        result: {
            activeRuns: string[];
        };
    };
    'media.transcribeAudio': {
        params: {
            filePath: string;
        };
        result: {
            text: string;
        };
    };
    'media.describeImage': {
        params: {
            filePath: string;
        };
        result: {
            description: string;
        };
    };
    'media.extractDocument': {
        params: {
            filePath: string;
            mimeType: string;
        };
        result: {
            text: string;
        };
    };
    'web.fetch': {
        params: {
            url: string;
            extractMode?: 'markdown' | 'text';
            maxChars?: number;
        };
        result: {
            text: string;
        };
    };
    'channel.send': {
        params: {
            sessionKey: string;
            text: string;
            /** Optional source sessionKey for cross-session forwards. When set, the message is also
             *  appended to the target session's history as `[fromSessionKey] text` so the receiving
             *  agent knows it came from elsewhere (cron, webhook, agent forwarding to another channel). */
            fromSessionKey?: string;
        };
        result: {
            sent: boolean;
        };
    };
    'channel.sendMedia': {
        params: {
            sessionKey: string;
            filePath: string;
            mimeType: string;
            caption?: string;
        };
        result: {
            sent: boolean;
        };
    };
    'channel.search': {
        params: {
            query?: string;
            page: number;
            limit?: number;
        };
        result: Pagination<ChannelInfo>;
    };
    'channel.get': {
        params: {
            instanceId: string;
        };
        result: ChannelInfo;
    };
    'channel.register': {
        params: ChannelEntry & {
            persist?: boolean;
        };
        result: void;
    };
    'cron.search': {
        params: {
            query?: string;
            page?: number;
            limit?: number;
        };
        result: Pagination<CronTask>;
    };
    'cron.add': {
        params: CronAddParams;
        result: void;
    };
    'cron.remove': {
        params: {
            id: string;
        };
        result: void;
    };
    'cron.update': {
        params: CronUpdateParams;
        result: void;
    };
    'cron.run': {
        params: {
            id: string;
        };
        result: void;
    };
    'webhook.search': {
        params: {
            query?: string;
            page: number;
            limit?: number;
        };
        result: Pagination<WebhookEntry>;
    };
    'memory.search': {
        params: {
            query: string;
            maxResults?: number;
            minScore?: number;
        };
        result: MemorySearchResult[];
    };
    'memory.read': {
        params: {
            path: string;
            from?: number;
            lines?: number;
        };
        result: {
            path: string;
            text: string;
        };
    };
    'memory.write': {
        params: {
            path: string;
            content: string;
            mode?: 'overwrite' | 'append';
        };
        result: void;
    };
    'memory.stats': {
        params: Record<string, never>;
        result: {
            files: number;
            chunks: number;
            lastSync: Date | null;
        };
    };
    'log.search': {
        params: {
            sinceMs?: number;
            service?: string;
            level?: LogLevel;
        };
        result: ErrorEntry[];
    };
    'bus.search': {
        params: {
            query?: string;
        };
        result: EventMetadata[];
    };
    'bus.inspect': {
        params: {
            event: string;
        };
        result: EventMetadata | null;
    };
    /** Restart a named service (calls stop + re-boot). */
    'bus.restart': {
        params: {
            service: string;
        };
        result: {
            ok: boolean;
        };
    };
    /** List all registered services and their status. */
    'bus.status': {
        params: Record<string, never>;
        result: {
            services: Array<{
                name: string;
                status: string;
            }>;
        };
    };
}
//# sourceMappingURL=events.d.ts.map