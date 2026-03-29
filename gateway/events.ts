// Single source of truth for all inter-service communication.
//
// Two event shapes:
//   Pure     — flat payload, use bus.emit / @on
//   Callable — { params, result }, use bus.call / @on (wired as request/reply)

export type { ThinkingLevel, PromptMode, ChannelEntry, CronTask, CronAddParams, CronUpdateParams, WebhookEntry, Json, AppConfig } from '../services/config/index.js';
import type { ThinkingLevel, PromptMode, ChannelEntry, CronTask, CronAddParams, CronUpdateParams, WebhookEntry, Json, AppConfig } from '../services/config/index.js';

// ─── Domain types ─────────────────────────────────────────────────────────────

export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type LogLevel      = 'debug' | 'info' | 'warn' | 'error';

export type Pagination<T> = { items: T[]; page: number; limit: number };

export interface MediaItem           { filePath: string; mimeType: string }
export interface ChannelInfo         { instanceId: string; type: string; status: ChannelStatus }
export interface SkillEntry          { name: string; description: string; tags: string[] }
export interface ErrorEntry          { service: string; error: string; context?: Json; timestamp: number }
export interface MemorySearchResult  { citation: string; score: number; content: string; startLine: number; endLine: number }

// Session types defined here (bus contract layer) — services import from here
export type MessageRole = 'user' | 'assistant' | 'system';
export interface Message {
  id:        string;
  sessionKey: string;
  role:      MessageRole;
  content:   string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
export interface Session {
  sessionKey: string;
  label?:    string;
  kind:      'main' | 'subagent' | 'cron';
  createdAt: Date;
  updatedAt: Date;
  metadata:  Record<string, unknown>;
  notify?:   string[];
}

// ─── Param types ──────────────────────────────────────────────────────────────

export interface AgentExecuteParams {
  sessionKey:     string;
  task:           string;
  thinkingLevel?: ThinkingLevel;
  model?:         string;
  promptMode?:    PromptMode;
  media?:         MediaItem[];
  notify?:        string[];
}

export interface SessionCreateParams {
  sessionKey: string;
  model?:     string;
  notify?:    string[];
  metadata?:  Record<string, Json>;
}

export interface SessionAddMessageParams {
  sessionKey: string;
  role:       MessageRole;
  content:    string;
  metadata?:  Record<string, Json>;
}

// ─── Event map ────────────────────────────────────────────────────────────────

export interface EventMap {
  // ── Pure events ────────────────────────────────────────────────────────────

  /** Structured log line — LogService subscribes and handles output + persistence. */
  'log': { level: LogLevel; service: string; message: string; data?: Json };

  /** Emitted when new callable events are added at runtime (e.g. dynamic service registration). */
  'tools.onRegistered': { events: string[] };

  /** Streaming LLM chunk from an active agent run. */
  'agent.onDelta': { sessionKey: string; chunk: string };

  /** Tool lifecycle within a run. */
  'agent.onTool': { sessionKey: string; toolName: string; phase: 'start' | 'end'; args?: Json; result?: Json };

  /** Run finished (success or failure). */
  'agent.onCompleted': { sessionKey: string; success: boolean; response?: string; error?: string };

  'channel.onConnected':    { instanceId: string; type: string };
  'channel.onDisconnected': { instanceId: string };

  /** Inbound message from a channel adapter — AgentService subscribes to handle the run. */
  'channel.onInbound': {
    channel: string;
    userId: string;
    sessionKey: string;
    content: string;
    metadata?: Record<string, unknown>;
  };

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
  'agent.spawn':   { params: { sessionKey: string; task: string; agent?: string; role?: string; model?: string }; result: { sessionKey: string; response: string } };
  'agent.abort':   { params: { sessionKey: string }; result: { aborted: boolean } };
  'agent.status':  { params: { sessionKey?: string }; result: { activeRuns: string[] } };

  // Media
  'media.transform': { params: { filePath: string; mimeType: string; modelName: string }; result: { text: string } };

  // File system
  'fs.read':  { params: { path: string; offset?: number; limit?: number }; result: { content: string; mimeType: string } };
  'fs.write': { params: { path: string; content: string }; result: void };
  'fs.edit':  { params: { path: string; oldText: string; newText: string }; result: void };
  'fs.exec':  { params: { command: string; timeout?: number }; result: { stdout: string; stderr: string; exitCode: number } };

  // Web
  'web.fetch': { params: { url: string; extractMode?: 'markdown' | 'text'; maxChars?: number }; result: { text: string } };

  // Workspace / skills
  'workspace.loadSkill':  { params: { name: string }; result: { content: string } };
  'workspace.listSkills': { params: Record<string, never>; result: SkillEntry[] };

  // Channels
  'channel.send':     { params: { sessionKey: string; text: string }; result: { sent: boolean } };
  'channel.sendMedia':{ params: { sessionKey: string; filePath: string; mimeType: string; caption?: string }; result: { sent: boolean } };
  'channel.search':   { params: { query?: string; page: number; limit?: number }; result: Pagination<ChannelInfo> };
  'channel.get':      { params: { instanceId: string }; result: ChannelInfo };
  'channel.register': { params: ChannelEntry & { persist?: boolean }; result: void };

  // Sessions
  'session.create':     { params: SessionCreateParams; result: void };
  'session.get':        { params: { sessionKey: string }; result: Session };
  'session.addMessage': { params: SessionAddMessageParams; result: void };
  'session.getMessages':{ params: { sessionKey: string; limit?: number }; result: Message[] };
  'session.search':     { params: { query?: string; page: number; limit?: number }; result: Pagination<Session> };
  'session.delete':     { params: { sessionKey: string }; result: void };
  'session.compact':    { params: { sessionKey: string; count: number }; result: void };

  // Cron
  'cron.search': { params: { query?: string; page: number; limit?: number }; result: Pagination<CronTask> };
  'cron.add':    { params: CronAddParams; result: void };
  'cron.remove': { params: { id: string }; result: void };
  'cron.update': { params: CronUpdateParams; result: void };
  'cron.run':    { params: { id: string }; result: void };

  // Webhooks
  'webhook.search': { params: { query?: string; page: number; limit?: number }; result: Pagination<WebhookEntry> };

  // Memory
  'memory.search': { params: { query: string; maxResults?: number; minScore?: number }; result: MemorySearchResult[] };
  'memory.read':   { params: { path: string; from?: number; lines?: number }; result: { path: string; text: string } };
  'memory.write':  { params: { path: string; content: string; mode?: 'overwrite' | 'append' }; result: void };
  'memory.stats':  { params: Record<string, never>; result: { files: number; chunks: number; lastSync: Date | null } };

  // Errors
  'error.search': { params: { sinceMs?: number; service?: string; level?: LogLevel }; result: ErrorEntry[] };

  // Bus introspection
  'bus.search': { params: { query?: string }; result: EventMetadata[] };
  'bus.inspect': { params: { event: string }; result: EventMetadata | null };
}

export interface EventMetadata {
  event: string;
  description: string;
  type: 'pure' | 'callable';
  schema?: { params?: unknown; result?: unknown };
}

// ─── Runtime callable set ─────────────────────────────────────────────────────
// Mirrors the callable entries in EventMap. Used by the bus at runtime to decide
// whether to wire a handler for correlation-ID request/reply vs plain pub/sub.

export const CALLABLE_EVENTS = new Set<keyof EventMap>([
  'config.get', 'config.set',
  'agent.execute', 'agent.spawn', 'agent.abort', 'agent.status',
  'media.transform',
  'fs.read', 'fs.write', 'fs.edit', 'fs.exec',
  'web.fetch',
  'workspace.loadSkill', 'workspace.listSkills',
  'channel.send', 'channel.sendMedia', 'channel.search', 'channel.get', 'channel.register',
  'session.create', 'session.get', 'session.addMessage', 'session.getMessages',
  'session.search', 'session.delete', 'session.compact',
  'cron.search', 'cron.add', 'cron.remove', 'cron.update', 'cron.run',
  'webhook.search',
  'memory.search', 'memory.read', 'memory.write', 'memory.stats',
  'error.search',
  'bus.search', 'bus.inspect',
]);
