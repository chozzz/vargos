# Sessions

Sessions persist conversation history and provide isolation between different interaction contexts.

## Session Key Formats

| Format | Example | Created By | Prompt Mode | History Limit |
|--------|---------|-----------|-------------|---------------|
| `cli:chat` | `cli:chat` | CLI `vargos chat` | full | 50 turns |
| `cli:run:<timestamp>` | `cli:run:1708865234567` | CLI `vargos run` | full | 50 turns |
| `whatsapp:<userId>` | `whatsapp:61423222658` | WhatsApp adapter | full | 30 turns |
| `telegram:<chatId>` | `telegram:123456` | Telegram adapter | full | 30 turns |
| `cron:<taskId>:<timestamp>` | `cron:daily-report:1708865234567` | Cron service | minimal | 10 turns |
| `webhook:<hookId>:<timestamp>` | `webhook:github-pr:1708865234567` | Webhook service | minimal | 10 turns |
| `<parent>:subagent:<timestamp>-<rand>` | `cli:chat:subagent:1708865240123-x7k2q` | `sessions_spawn` tool | full | inherits root |
| `mcp:default` | `mcp:default` | MCP bridge | full | 50 turns |

Session key construction is centralized in `src/sessions/keys.ts`. Builder functions: `channelSessionKey()`, `cronSessionKey()`, `webhookSessionKey()`, `cliSessionKey()`, `subagentSessionKey()`.

## Behaviors Driven by Session Key

**Prompt mode** (`src/agent/prompt.ts`):
- `full` — all workspace files injected (subagents, channels, CLI)
- `minimal` — cron jobs only

**History limit** (`src/agent/history.ts`):
- Derived from the root session key (before `:subagent:`)
- Channels (whatsapp/telegram): 30 turns
- Cron: 10 turns
- Everything else: 50 turns
- Subagents inherit the limit of their root session

**Subagent spawning** (`src/sessions/keys.ts`):
- Subagents can spawn children up to depth 3 (depth-limited, not flat-denied)
- All tools are available to subagents — no deny list

## Session Isolation

Each session key maps to an independent conversation. Sessions do **not** share history:

- Cron jobs use `cron:<taskId>:<timestamp>` — fresh session per fire
- Cron results are delivered only to explicit `notify` targets configured per task — no delivery if unset
- Notifications inject the result into the recipient's channel session for context, then send via `channel.send`
- Cross-session context is also possible through workspace files (e.g., memory files, MEMORY.md)

## Storage

Sessions are stored as JSONL files in `~/.vargos/sessions/` by `FileSessionService`. Each file contains:
- Line 0: session metadata (key, kind, timestamps)
- Remaining lines: individual messages (role, content, timestamp, metadata)

File names use base64url-encoded session keys (e.g., `Y2xpOmNoYXQ.jsonl` for `cli:chat`).

The Pi SDK runs in-memory only — no session files from the LLM runtime. All persistence goes through `FileSessionService`. Before each agent run, history is loaded from `FileSessionService`, converted to `AgentMessage[]` via `toAgentMessages()`, sanitized, and injected into the Pi SDK session.

## Lifecycle

- **Chat sessions** (`cli:chat`) persist across restarts — resume where you left off
- **Run sessions** (`cli:run:<ts>`) use a unique timestamp key per invocation — each run is a fresh session
- **Channel sessions** (`whatsapp:*`, `telegram:*`) are keyed by sender ID — one session per contact
- **Cron sessions** (`cron:<taskId>:<ts>`) get a fresh session per fire via timestamp suffix
- **Webhook sessions** (`webhook:<hookId>:<ts>`) get a fresh session per fire via timestamp suffix
- **Subagent sessions** (`*:subagent:*`) include timestamp + random suffix, always fresh

## Message Queue

Messages are serialized per session — only one agent run executes per session at a time. Concurrent messages to the same session are queued and processed in order.

See [runtime.md](./runtime.md) for agent execution details.
