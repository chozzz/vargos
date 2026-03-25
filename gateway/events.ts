// Single source of truth for all inter-service communication.
//
// Two event shapes:
//   Pure     — flat payload, use bus.emit / @on
//   Callable — { params, result }, use bus.call / @on (wired as request/reply)

export type { ThinkingLevel, PromptMode, ChannelEntry, CronTask, CronAddParams, CronUpdateParams, WebhookEntry } from '../config/schemas.js';
import type { ThinkingLevel, PromptMode, ChannelEntry, CronTask, CronAddParams, CronUpdateParams, WebhookEntry } from '../config/schemas.js';

export type { Json } from '../config/schemas.js';
import type { Json } from '../config/schemas.js';

export type { Session, Message, MessageRole } from '../services/sessions/schemas.js';
import type { Session, Message, MessageRole } from '../services/sessions/schemas.js';

// ─── Domain types ────────────────────────────────────────────────────────────

export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type Pagination<T> = {
  items: T[];
  page: number;
  limit: number;
}

export interface MediaItem {
  filePath: string;
  mimeType: string;
}

export interface ChannelInfo {
  instanceId: string;
  type: string;
  status: ChannelStatus;
}

// ─── Param types ─────────────────────────────────────────────────────────────

export interface AgentExecuteParams {
  sessionKey: string;
  task: string;
  thinkingLevel?: ThinkingLevel;
  model?: string;
  promptMode?: PromptMode;
  media?: MediaItem[];
}

export interface SessionCreateParams {
  sessionKey: string;
  channelId?: string;
  taskId?: string;
  model?: string;
  notify?: string[];
  metadata?: Record<string, Json>;
}

export interface SessionAddMessageParams {
  sessionKey: string;
  role: MessageRole;
  content: string;
  metadata?: Record<string, Json>;
}

// ─── Event map ───────────────────────────────────────────────────────────────

export interface EventMap {
  // ── Pure events (flat payload) ──────────────────────────────────────────

  /** Streaming chunk from an active run */
  'agent.onDelta': { sessionKey: string; chunk: string };

  /** Tool lifecycle within a run */
  'agent.onTool': {
    sessionKey: string;
    toolName: string;
    phase: 'start' | 'end';
    args?: Json;
    result?: Json;
  };

  /** Run finished (success or failure) */
  'agent.onCompleted': {
    sessionKey: string;
    success: boolean;
    response?: string;
    error?: string;
  };

  'channel.onConnected': { instanceId: string; type: string };
  'channel.onDisconnected': { instanceId: string };

  // ── Callable events ({ params, result }) ────────────────────────────────

  /** Single entry point for all agent runs — channels, cron, webhooks, and tools */
  'agent.execute': { params: AgentExecuteParams; result: { response: string } };

  /** STT/OCR preprocessing — converts audio/image to text before the LLM sees it */
  'media.transform': { params: { filePath: string; mimeType: string; modelName: string }; result: { text: string } };

  'agent.abort': { params: { sessionKey: string }; result: { aborted: boolean } };
  'agent.status': { params: { sessionKey?: string }; result: { activeRuns: string[] } };

  'channel.send': { params: { sessionKey: string; text: string }; result: { sent: boolean } };
  'channel.sendMedia': { params: { sessionKey: string; filePath: string; mimeType: string; caption?: string }; result: { sent: boolean } };
  'channel.search': { params: { query?: string; page: number; limit?: number }; result: Pagination<ChannelInfo> };
  'channel.get': { params: { instanceId: string }; result: ChannelInfo };
  /** Register a channel — persist: true writes to config.json (default), false = runtime-only */
  'channel.register': { params: ChannelEntry & { persist?: boolean }; result: void };

  'session.create': { params: SessionCreateParams; result: void };
  'session.get': { params: { sessionKey: string }; result: Session };
  'session.addMessage': { params: SessionAddMessageParams; result: void };
  'session.getMessages': { params: { sessionKey: string; limit?: number }; result: Message[] };
  'session.search': { params: { query?: string; page: number; limit?: number }; result: Pagination<Session> };
  'session.delete': { params: { sessionKey: string }; result: void };
  'session.compact': { params: { sessionKey: string; count: number }; result: void };

  'cron.search': { params: { query?: string; page: number; limit?: number }; result: Pagination<CronTask> };
  'cron.add': { params: CronAddParams; result: void };
  'cron.remove': { params: { id: string }; result: void };
  'cron.update': { params: CronUpdateParams; result: void };
  'cron.run': { params: { id: string }; result: void };

  'webhook.search': { params: { query?: string; page: number; limit?: number }; result: Pagination<WebhookEntry> };
}

// ─── Runtime callable set ────────────────────────────────────────────────────
// Mirrors the callable entries in EventMap above. Used by the bus at runtime
// to decide whether to wire a handler for correlation vs plain pub/sub.

export const CALLABLE_EVENTS = new Set<keyof EventMap>([
  'agent.execute',
  'media.transform',
  'agent.abort',
  'agent.status',
  'channel.send',
  'channel.sendMedia',
  'channel.search',
  'channel.get',
  'channel.register',
  'session.create',
  'session.get',
  'session.addMessage',
  'session.getMessages',
  'session.search',
  'session.delete',
  'session.compact',
  'cron.search',
  'cron.add',
  'cron.remove',
  'cron.update',
  'cron.run',
  'webhook.search',
]);
