// Single source of truth for all inter-service communication.
//
// Two event shapes:
//   Pure     — flat payload, use bus.emit / @on
//   Callable — { params, result }, use bus.call / @on (wired as request/reply)

export type { ThinkingLevel, ChannelEntry, CronTask, CronAddParams, CronUpdateParams, WebhookEntry, Json, AppConfig } from '../services/config/index.js';
import type { ThinkingLevel, ChannelEntry, CronTask, CronAddParams, CronUpdateParams, WebhookEntry, Json, AppConfig } from '../services/config/index.js';

// ─── Domain types ─────────────────────────────────────────────────────────────

export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Pagination<T> = { items: T[]; page: number; limit: number };

export interface ChannelInfo { instanceId: string; type: string; status: ChannelStatus }
export interface ErrorEntry { service: string; error: string; context?: Json; timestamp: number }
export interface MemorySearchResult { citation: string; score: number; content: string; startLine: number; endLine: number }

export interface EventMetadata {
  event: string;
  description: string;
  type: 'handler' | 'tool';
  schema?: { params?: unknown; result?: unknown };
}

// ─── Param types ──────────────────────────────────────────────────────────────

export interface AgentExecuteParams {
  sessionKey: string;
  task: string;
  /** Working directory for the agent — defaults to vargos workspace. When set,
   *  bootstrap files (CLAUDE.md, AGENTS.md) from both cwd and workspace are merged. */
  cwd?: string;
  thinkingLevel?: ThinkingLevel;
  model?: string;
  /** Image attachments for vision models (base64 encoded) */
  images?: Array<{ data: string; mimeType: string }>;
  /** Execution timeout in milliseconds. Falls back to config.agent.executionTimeoutMs if not provided. */
  timeoutMs?: number;
}

// ─── Event map ────────────────────────────────────────────────────────────────

export interface EventMap {
  // ── Pure events ────────────────────────────────────────────────────────────

  /** Structured log line — LogService subscribes and handles output + persistence. */
  'log.onLog': { level: LogLevel; service: string; message: string; data?: Json };

  /** Streaming LLM chunk from an active agent run. */
  'agent.onDelta': { sessionKey: string; chunk: string };

  /** Tool lifecycle within a run. */
  'agent.onTool': { sessionKey: string; toolName: string; phase: 'start' | 'end'; args?: Json; result?: Json };

  /** Run finished (success or failure). */
  'agent.onCompleted': { sessionKey: string; success: boolean; response?: string; error?: string };

  'channel.onConnected': { instanceId: string; type: string };
  'channel.onDisconnected': { instanceId: string };

  /** Broadcast whenever config changes via config.set. */
  'config.onChanged': AppConfig;

  /** Emitted after all services are registered — signals boot completion. Deferred startup can proceed. */
  'bus.onReady': Record<string, never>;

  // ── Callable events ────────────────────────────────────────────────────────

  // Config
  'config.get': { params: Record<string, never>; result: AppConfig };
  'config.set': { params: AppConfig; result: AppConfig };

  // Agent
  'agent.execute': { params: AgentExecuteParams; result: { response: string } };
  'agent.status': { params: { sessionKey?: string }; result: { activeRuns: string[] } };
  'agent.getProviderConfig': { params: { provider: string }; result: { baseUrl?: string; apiKey?: string; api?: string } | null };

  // File system
  'fs.read': { params: { path: string; offset?: number; limit?: number }; result: { content: string; mimeType: string } };
  'fs.write': { params: { path: string; content: string }; result: void };
  'fs.edit': { params: { path: string; oldText: string; newText: string }; result: void };
  'fs.exec': { params: { command: string; timeout?: number }; result: { stdout: string; stderr: string; exitCode: number } };

  // Web
  'web.fetch': { params: { url: string; extractMode?: 'markdown' | 'text'; maxChars?: number }; result: { text: string } };

  // Channels
  'channel.send': { params: { sessionKey: string; text: string }; result: { sent: boolean } };
  'channel.sendMedia': { params: { sessionKey: string; filePath: string; mimeType: string; caption?: string }; result: { sent: boolean } };
  'channel.search': { params: { query?: string; page: number; limit?: number }; result: Pagination<ChannelInfo> };
  'channel.get': { params: { instanceId: string }; result: ChannelInfo };
  'channel.register': { params: ChannelEntry & { persist?: boolean }; result: void };

  // Cron
  'cron.search': { params: { query?: string; page: number; limit?: number }; result: Pagination<CronTask> };
  'cron.add': { params: CronAddParams; result: void };
  'cron.remove': { params: { id: string }; result: void };
  'cron.update': { params: CronUpdateParams; result: void };
  'cron.run': { params: { id: string }; result: void };

  // Webhooks
  'webhook.search': { params: { query?: string; page: number; limit?: number }; result: Pagination<WebhookEntry> };

  // Memory
  'memory.search': { params: { query: string; maxResults?: number; minScore?: number }; result: MemorySearchResult[] };
  'memory.read': { params: { path: string; from?: number; lines?: number }; result: { path: string; text: string } };
  'memory.write': { params: { path: string; content: string; mode?: 'overwrite' | 'append' }; result: void };
  'memory.stats': { params: Record<string, never>; result: { files: number; chunks: number; lastSync: Date | null } };

  // Errors / Log
  'log.search': { params: { sinceMs?: number; service?: string; level?: LogLevel }; result: ErrorEntry[] };

  // Bus introspection
  'bus.search': { params: { query?: string }; result: EventMetadata[] };
  'bus.inspect': { params: { event: string }; result: EventMetadata | null };
}
