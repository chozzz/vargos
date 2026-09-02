/**
 * Types for the console.
 *
 * Canonical shapes (config, cron, channels, providers) are imported straight from
 * the daemon's `services/config` so the web can never drift from the source of
 * truth. Everything else here is a *view* type: a projection the API routes build
 * on top of a bus result (e.g. the flattened provider list) or a shape the daemon
 * has no schema for (session JSONL transcripts, WebSocket frames).
 */

import type {
  AppConfig,
  ChannelEntry,
  CronTask,
  ProviderConfig,
  Providers,
} from "@vargos/services/config";

export type { AppConfig, ChannelEntry, CronTask, ProviderConfig, Providers };

// ── Sessions (JSONL transcripts — Pi SDK owns this format) ────────────────────

export interface SessionFile {
  /** Basename, e.g. `2026-08-16T11-48-03-398Z_01a00a66-....jsonl` */
  file: string;
  /** Path relative to the sessions dir, e.g. `telegram-bakabit/7789463749/subagent/69f322c8/xxx.jsonl` */
  path: string;
  /** Top-level channel dir name */
  channel: string;
  /** Second-level dir (chat id) if present, else null */
  chatId: string | null;
  /** Subagent id if the file lives under `subagent/<id>/`, else null */
  subagentId: string | null;
  sizeBytes: number;
  mtimeMs: number;
  /** Timestamp from the leading `session` line, else null */
  startedAt: string | null;
  messageCount: number;
  /** `provider/modelId` from the last `model_change`, else null */
  lastModel: string | null;
}

export interface ChannelSessions {
  channel: string;
  fileCount: number;
  totalBytes: number;
  files: SessionFile[];
}

export interface TranscriptSession {
  kind: "session";
  id: string;
  version: number;
  startedAt: string;
  cwd: string;
}
export interface TranscriptModelChange {
  kind: "model_change";
  provider: string;
  modelId: string;
  at: string;
}
export interface TranscriptThinkingLevel {
  kind: "thinking_level_change";
  thinkingLevel: string;
  at: string;
}
export interface TranscriptMessage {
  kind: "message";
  role: string;
  content: unknown;
  provider?: string;
  model?: string;
  stopReason?: string;
  usage?: Record<string, number>;
  at: string;
  /** Raw JSONL line for anything the UI may want later */
  raw: Record<string, unknown>;
}
export interface TranscriptOther {
  kind: "other";
  type: string;
  raw: Record<string, unknown>;
}
export type TranscriptEvent =
  | TranscriptSession
  | TranscriptModelChange
  | TranscriptThinkingLevel
  | TranscriptMessage
  | TranscriptOther;

export interface Transcript {
  channel: string;
  chatId: string | null;
  subagentId: string | null;
  file: string;
  events: TranscriptEvent[];
}

// ── Models — flattened `config.providers` record → array (view of `Providers`) ─

export interface ProviderModel {
  id: string;
  name: string;
  input: string[];
  contextWindow: number | null;
  maxTokens: number | null;
  cost: Record<string, number>;
}
export interface ModelProvider {
  /** Provider key, e.g. `vargos-109:llama-cpp` */
  key: string;
  baseUrl: string | null;
  api: string | null;
  models: ProviderModel[];
}

// ── MCP servers — 1:1 with the daemon's `mcp.list` result ─────────────────────

export interface McpServer {
  name: string;
  command: string | null;
  args: string[];
  transport: string;
  enabled: boolean;
  connected: boolean;
  toolCount: number;
}

// ── Personas (agents/*.md — filesystem, no bus method) ────────────────────────

export interface AgentPersona {
  file: string;
  /** Frontmatter keys (name, allowedTools, ...) as-is */
  meta: Record<string, unknown>;
  body: string;
}

// ── Channels — config entry (canonical) + live `channel.list` status ──────────

/** A `config.channels[]` entry, loosened for the raw JSON pretty-printer in the UI. */
export type ChannelConfig = ChannelEntry & { [key: string]: unknown };

export interface ChannelStatus {
  id: string;
  type?: string;
  /** "connected" | "disconnected" — mirrors vargos `channel.list` items */
  status: string;
  [key: string]: unknown;
}
export interface ChannelsPayload {
  configured: ChannelConfig[];
  live: ChannelStatus[] | null;
}

// ── Gateway / services ───────────────────────────────────────────────────────

export interface ServiceStatus {
  name: string;
  status: string;
}
export interface GatewayInfo {
  host: string;
  port: number;
  online: boolean;
}
export interface StatusPayload {
  gateway: GatewayInfo;
  services: ServiceStatus[] | null;
  agent: Record<string, unknown> | null;
  memory: MemoryStats | null;
}

// ── Memory — 1:1 with the daemon's `memory.stats` result ─────────────────────

export interface MemoryStats {
  files: number;
  chunks: number;
  /** ISO string (serialized `Date`), else null */
  lastSync: string | null;
}

// ── WebSocket events pushed to clients ───────────────────────────────────────

export type WsEvent =
  | { type: "fs_change"; path: string; change: string; at: string }
  | { type: "gateway_status"; payload: StatusPayload; at: string }
  | { type: "hello"; wsPort: number; dataDir: string };
