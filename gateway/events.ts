// Single source of truth for all inter-service communication.
//
// Two event shapes:
//   Pure     — flat payload, use bus.emit / @on
//   Callable — { params, result }, use bus.call / @on (wired as request/reply)

export type { ThinkingLevel, ChannelEntry, CronTask, CronAddParams, CronUpdateParams, WebhookEntry, Json, AppConfig } from '../services/config/index.js';
import type { ChannelEntry, CronTask, CronAddParams, CronUpdateParams, WebhookEntry, Json, AppConfig } from '../services/config/index.js';
export type { ImageMimeType, AudioMimeType, VideoMimeType, DocumentMimeType } from '../lib/media-transcribe.js';
import type { ImageMimeType, AudioMimeType, VideoMimeType, DocumentMimeType } from '../lib/media-transcribe.js';

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

export interface InboundMessageMetadata {
  /** Unique message identifier for reactions (e.g., Telegram message_id) */
  messageId?: string;
  /** When set to true, do not prompt agent. But still append the message to the agent's history. */
  skipAgent?: boolean;
  /** Working directory for the agent — defaults to vargos workspace. When set,
   *  bootstrap files (CLAUDE.md, AGENTS.md) from both cwd and workspace are merged. */
  cwd?: string;
  /** Username/display name of the message sender (for group chat attribution) */
  fromUser?: string;
  /** Sender's user ID (for whitelist enforcement). Platform-specific: Telegram user ID, WhatsApp JID, etc. */
  fromUserId?: string;
  /** Chat type — 'private' for 1:1, 'group' for group chats. Helps determine if bot was explicitly addressed. */
  chatType?: 'private' | 'group';
  /** True if bot was explicitly mentioned or replied to in a group chat. */
  isMentioned?: boolean;
  /** Platform/adapter type (e.g., 'telegram', 'whatsapp') */
  channelType?: string;
  /** Bot's own display name (e.g., Telegram bot username) */
  botName?: string;
  /** Model override for this message (e.g., "claude-opus-4"). If not set, uses agent.model from config. */
  model?: string;
  /** Path to channel/trigger-specific instructions file to include in system prompt. Auto-created if doesn't exist. */
  instructionsFile?: string;
  /** Media attachment metadata with content reference — discriminated by type */
  media?:
  | { type: 'image'; mimeType?: ImageMimeType; path?: string; description?: string }
  | { type: 'audio'; mimeType?: AudioMimeType; path?: string; transcription?: string }
  | { type: 'video'; mimeType?: VideoMimeType; path?: string }
  | { type: 'document'; mimeType?: DocumentMimeType; path?: string };
}

export interface AgentExecuteParams {
  /** Session key — required for direct callers (channels, cron, webhooks, TCP).
   *  When the agent calls agent.execute as a tool, wrapEventAsToolDefinition injects this automatically. */
  sessionKey: string;
  /** The task to execute or delegate to the agent. */
  task: string;
  /** The current working directory to use for the agent. Fallbacks to channel's cwd config, then lastly vargos workspace dir. */
  cwd?: string;

  /** Metadata for the inbound message */
  metadata?: InboundMessageMetadata;
}

// ─── Event map ────────────────────────────────────────────────────────────────

export interface EventMap {
  // ── Pure events ────────────────────────────────────────────────────────────

  /** Structured log line — LogService subscribes and handles output + persistence. */
  'log.onLog': { level: LogLevel; service: string; message: string; data?: Json };

  /** Streaming LLM chunk from an active agent run. */
  'agent.onDelta': { sessionKey: string; chunk: string };

  /** Tool lifecycle within a run. */
  'agent.onTool': (
    { sessionKey: string; toolName: string; phase: 'start'; args: Json } |
    { sessionKey: string; toolName: string; phase: 'end'; result: Json }
  );

  /** Run finished (success or failure). */
  'agent.onCompleted': (
    { sessionKey: string; success: true; response: string } |
    { sessionKey: string; success: false; error: string }
  );

  'channel.onConnected': { instanceId: string; type: string };
  'channel.onDisconnected': { instanceId: string };

  /** Emitted after all services are registered — signals boot completion. Deferred startup can proceed. */
  'bus.onReady': Record<string, never>;

  // ── Callable events ────────────────────────────────────────────────────────

  // Config
  'config.get': { params: Record<string, never>; result: AppConfig };
  'config.set': { params: AppConfig; result: AppConfig };

  // Agent
  'agent.execute': { params: AgentExecuteParams; result: { response: string } };
  'agent.appendMessage': { params: AgentExecuteParams; result: void };
  'agent.status': { params: { sessionKey?: string }; result: { activeRuns: string[] } };

  // Media
  'media.transcribeAudio': { params: { filePath: string }; result: { text: string } };
  'media.describeImage': { params: { filePath: string }; result: { description: string } };

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
