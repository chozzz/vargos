# Sessions

A session is one conversation thread. Pi SDK persists every turn to a JSONL file; Vargos caches the in-memory `AgentSession` keyed by sessionKey. Helpers: [`lib/subagent.ts`](../../lib/subagent.ts).

## SessionKey formats

| Format | Example | Source |
|---|---|---|
| `<channelId>:<chatId>` | `telegram-personal:7789463749` | Channel adapter |
| `cron:<taskId>:<YYYY-MM-DD>` | `cron:heartbeat:2026-05-06` | `cronSessionKey` |
| `webhook:<hookId>:<ms>` | `webhook:github:1746...` | `webhookSessionKey` |
| `<parent>:subagent:<child>` | `telegram-personal:7789...:subagent:research-1` | Subagent dispatch |

`parseSessionKey` strips the `:subagent:` suffix when present, so a subagent's parsed `type` matches the parent's. This is what lets channel personas and channel-routing work for nested agents automatically.

`parseChannelTarget` splits on the first `:` to get `{ channel, userId }` — used by `channel.send` to find the right adapter.

## Storage layout

Sessions live under `~/.vargos/sessions/<sessionKey-with-/>/` — Vargos converts `:` in sessionKey to path separators when computing the directory (see [`services/agent/index.ts`](../../services/agent/index.ts) `getOrCreateSession`). Each prompt creates a new JSONL file in that dir. When `LOG_LEVEL=debug`, the dir also gets `systemPrompt.md`, `customTools.md`, etc.

Examples:
- `~/.vargos/sessions/telegram-personal/7789463749/`
- `~/.vargos/sessions/cron/heartbeat/2026-05-06/`
- `~/.vargos/sessions/cli/` (used by `pnpm chat`)

## Lifecycle

1. **First touch** — `agent.execute` calls `getOrCreateSession`. If not cached, Vargos creates a Pi SDK `AgentSession`, loads any existing JSONL, and caches it.
2. **Each turn** — Pi SDK appends to the JSONL. Streaming events flow through `subscribeToSessionEvents` → bus.
3. **`agent_end`** — `agent.onCompleted` emits with the final response. **The session stays in memory** for follow-ups.
4. **Restart** — in-memory cache is empty after `pnpm start`. Next call for that sessionKey loads from disk.

## Observe-only path

For inbound messages where the agent shouldn't run (whitelist rejection, group chat without bot mention), the channel pipeline delegates to `adapter.shouldExecute()`. When it returns `false`, the message is recorded into history via `agent.appendMessage` without firing the LLM. No LLM call, no streaming, no `agent.onCompleted`.

## Cross-session injection

When `channel.send` is called with `fromSessionKey`, it sends the outbound text **and** appends `[fromSessionKey] text` to the target session's history (also via `agent.appendMessage`). Used by:

- Cron `notify` delivery
- Webhook `notify` delivery
- Agent forwarding from one channel to another (set `fromSessionKey: ${SESSION_KEY}` per `AGENTS.md` instructions)

Heartbeat is the one cron task that omits `fromSessionKey` — its outputs land in the channel but not in history.

## Memory indexer

[`services/memory/session-indexer.ts`](../../services/memory/session-indexer.ts) watches `~/.vargos/sessions/**/*.jsonl` and chunks turns into searchable embeddings. The agent uses `memory.search` to find prior turns across all sessions.

The heartbeat task curates: sessions → daily summaries (`memory/YYYY-MM-DD.md`) → topic files (`memory/<topic>.md`) → `MEMORY.md` index.

## See also

- [Runtime](./runtime.md) — execution flow
- [Personas](./personas.md) — per-channel system-prompt overrides
- [API Reference](../api-reference.md) — `agent.execute`, `agent.appendMessage`
