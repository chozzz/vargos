/** Typed fetch helpers for the vargos web API. */

import type {
  AgentPersona,
  ChannelsPayload,
  ChannelSessions,
  CronTask,
  McpServer,
  MemoryStats,
  ModelProvider,
  StatusPayload,
  Transcript,
} from "./types";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export interface StatusResponse extends StatusPayload {
  configuredChannels: import("./types").ChannelConfig[];
}

export const api = {
  status: () => getJson<StatusResponse>("/api/status"),
  sessions: (channel?: string) =>
    getJson<{ channels: ChannelSessions[] }>(
      channel
        ? `/api/sessions?channel=${encodeURIComponent(channel)}`
        : "/api/sessions",
    ),
  transcript: (relPath: string) =>
    getJson<Transcript>(
      `/api/sessions/transcript?path=${encodeURIComponent(relPath)}`,
    ),
  channels: () => getJson<ChannelsPayload>("/api/channels"),
  cron: () => getJson<{ jobs: CronTask[] }>("/api/cron"),
  models: () => getJson<{ providers: ModelProvider[] }>("/api/models"),
  mcp: () => getJson<{ servers: McpServer[] }>("/api/mcp"),
  agents: () => getJson<{ agents: AgentPersona[] }>("/api/agents"),
  memory: () => getJson<MemoryStats>("/api/memory"),
  /** Write action proxy → running gateway (bus method allow-list). */
  rpc: (method: string, params?: unknown) =>
    fetch("/api/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, params: params ?? {} }),
    }).then((r) => r.json()) as Promise<{ ok: boolean; result?: unknown; error?: string }>,
  /** Full merged AppConfig from the running gateway (for read-modify-write edits). */
  config: async (): Promise<Record<string, unknown>> => {
    const r = await api.rpc("config.get");
    if (!r.ok) throw new Error(r.error ?? "config.get failed");
    return (r.result ?? {}) as Record<string, unknown>;
  },
  /** Persist a patched whole-config back to the gateway. */
  saveConfig: (config: unknown) => api.rpc("config.set", config),
};
