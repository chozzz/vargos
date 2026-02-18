# Sessions

Sessions persist conversation history and provide isolation between different interaction contexts.

## Session Key Formats

| Format | Example | Created By | Prompt Mode | History Limit |
|--------|---------|-----------|-------------|---------------|
| `cli:chat` | `cli:chat` | CLI `vargos chat` | full | 50 turns |
| `cli:run` | `cli:run` | CLI `vargos run` | full | 50 turns |
| `whatsapp:<userId>` | `whatsapp:61423222658` | WhatsApp adapter | full | 30 turns |
| `telegram:<chatId>` | `telegram:123456` | Telegram adapter | full | 30 turns |
| `cron:<taskId>:<timestamp>` | `cron:cron-abc:1708300000` | Cron service | minimal | 10 turns |
| `agent:<id>:subagent:<rand>` | `agent:default:subagent:1708-x7k` | `sessions_spawn` tool | minimal | 10 turns |
| `mcp:default` | `mcp:default` | MCP bridge | full | 50 turns |

## Behaviors Driven by Session Key

**Prompt mode** (`src/agent/prompt.ts`):
- `full` — all workspace files injected (AGENTS.md, SOUL.md, USER.md, TOOLS.md, MEMORY.md, HEARTBEAT.md)
- `minimal` — AGENTS.md + TOOLS.md only (subagents, cron jobs)

**History limit** (`src/agent/history.ts`):
- Channels (whatsapp/telegram): 30 turns — tighter to fit context windows
- Subagents/cron: 10 turns — short-lived tasks
- Everything else: 50 turns

**Subagent detection** (`src/lib/errors.ts`):
- Matches `agent:*`, `*:subagent:*`, or any key containing `subagent`
- Subagents cannot use: `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `cron_add`, `cron_list`, `cron_remove`

## Session Isolation

Each session key maps to an independent conversation. Sessions do **not** share history:

- Cron jobs fire on `cron:<taskId>:<timestamp>` — every execution is a fresh session
- Cron results are broadcast to channels via `channel.send`, but the broadcast is one-way — it doesn't inject into the recipient's session
- Replying from WhatsApp to a cron broadcast starts a new turn on `whatsapp:<userId>`, which has no context of the cron output
- Cross-session context is only possible through workspace files (e.g., memory files, MEMORY.md)

## Storage

Sessions are stored as JSONL files in `~/.vargos/sessions/`. Each file contains:
- Line 0: session metadata (key, kind, timestamps)
- Remaining lines: individual messages (role, content, timestamp)

File names are the session key with `:` replaced by `-` (e.g., `cli-chat.jsonl`).

## Lifecycle

- **Chat sessions** (`cli:chat`) persist across restarts — resume where you left off
- **Run sessions** (`cli:run`) reuse the same key, so history accumulates across runs
- **Channel sessions** (`whatsapp:*`, `telegram:*`) are keyed by sender ID — one session per contact
- **Cron sessions** (`cron:*:*`) include a timestamp, so each execution is isolated
- **Subagent sessions** (`agent:*:subagent:*`) include a random suffix, always fresh

## Message Queue

Messages are serialized per session — only one agent run executes per session at a time. Concurrent messages to the same session are queued and processed in order.

See [runtime.md](./runtime.md) for agent execution details.
