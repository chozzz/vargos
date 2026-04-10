// Single source of truth for all inter-service communication.
//
// Two event shapes:
//   Pure     — flat payload, use bus.emit / @on
//   Callable — { params, result }, use bus.call / @on (wired as request/reply)

export type { ThinkingLevel, PromptMode, ChannelEntry, CronTask, CronAddParams, CronUpdateParams, WebhookEntry, Json, AppConfig } from '../services/config/index.js';
import type { ThinkingLevel, PromptMode, ChannelEntry, CronTask, CronAddParams, CronUpdateParams, WebhookEntry, Json, AppConfig } from '../services/config/index.js';

// ─── Domain types ─────────────────────────────────────────────────────────────

export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Pagination<T> = { items: T[]; page: number; limit: number };

export interface MediaItem { filePath: string; mimeType: string }
export interface ChannelInfo { instanceId: string; type: string; status: ChannelStatus }
export interface ErrorEntry { service: string; error: string; context?: Json; timestamp: number }
export interface MemorySearchResult { citation: string; score: number; content: string; startLine: number; endLine: number }

/** Shared message shape (e.g. memory / future persistence); not a bus RPC surface. */
export type MessageRole = 'user' | 'assistant' | 'system';
export interface Message {
  id: string;
  sessionKey: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface Session {
  sessionKey: string;
  label?: string;
  kind: 'main' | 'subagent' | 'cron';
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
  notify?: string[];
}

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
  promptMode?: PromptMode;
  media?: MediaItem[];
  notify?: string[];
  retrigger?: boolean;
  /** Image attachments for vision models (base64 encoded) */
  images?: Array<{ data: string; mimeType: string }>;
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

  /** Emitted when context compaction occurs */
  'agent.compaction': { sessionKey: string; result: { tokensBefore: number; summary: string; firstKeptEntryId?: string } };

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
  'agent.abort': { params: { sessionKey: string }; result: { aborted: boolean } };
  'agent.status': { params: { sessionKey?: string }; result: { activeRuns: string[] } };
  'agent.process-retriggers': { params: Record<string, never>; result: { processed: number } };
  'model.register': { params: { provider: string; model: string; baseUrl?: string; contextWindow?: number; maxTokens?: number }; result: { registered: boolean; reason?: string } };

  // Media
  'media.transform': { params: { filePath: string; mimeType: string; modelName: string }; result: { text: string } };

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
