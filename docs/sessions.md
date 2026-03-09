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
| `<parent>:subagent:<timestamp>-<rand>` | `cli:chat:subagent:1708865240123-x7k2q` | `sessions_spawn` tool | minimal-subagent | inherits root |
| `mcp:default` | `mcp:default` | MCP bridge | full | 50 turns |

Session key construction is centralized in `src/sessions/keys.ts`. Builder functions: `channelSessionKey()`, `cronSessionKey()`, `webhookSessionKey()`, `cliSessionKey()`, `subagentSessionKey()`.

## Behaviors Driven by Session Key

**Prompt mode** (`src/agent/prompt.ts`):
- `full` — all sections, orchestration guidance, memory recall (channels, CLI)
- `minimal` — cron jobs only (tooling, workspace, heartbeat, bootstrap files)
- `minimal-subagent` — subagents (tooling, workspace, bootstrap files, focused worker guidance; no memory, heartbeats, or codebase context)

**History limit** (`src/agent/history.ts`):
- Derived from the root session key (before `:subagent:`)
- Channels (whatsapp/telegram): 30 turns
- Cron: 10 turns
- Everything else: 50 turns
- Subagents inherit the limit of their root session

**Subagent spawning** (`src/sessions/keys.ts`):
- Depth limit: `agent.subagents.maxSpawnDepth` (default 3)
- Breadth limit: `agent.subagents.maxChildren` (default 10) active children per parent
- Run timeout: `agent.subagents.runTimeoutSeconds` (default 300)

## Subagent Lifecycle

1. Parent agent calls `sessions_spawn` tool with a task description and optional `role` (persona override)
2. Spawn tool enforces depth + breadth limits, creates child session
3. Child agent runs in background (fire-and-forget)
4. On completion, result is announced to parent as a `system` message with `metadata.type = 'subagent_announce'`
5. Re-trigger is debounced (3s) — if multiple subagents complete close together, parent is re-triggered once
6. Parent sees subagent results in history (injected as `user` messages by `toAgentMessages`)
7. Parent synthesizes results and delivers to user

**Announce format:**
```
[Subagent Complete] session=<childKey> status=success|error duration=5.2s

<result summary, max 500 chars>
```

**Timeout behavior:** If a subagent exceeds `runTimeoutSeconds`, the spawn tool aborts it via `agent.abort`. The parent receives a timeout announcement.

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

## Training Data Enrichment

Assistant messages are enriched at write-time with metadata for fine-tuning and analysis. Every agent response stored via `storeResponse` includes:

```jsonc
{
  "role": "assistant",
  "content": "...",
  "timestamp": 1708865234567,
  "metadata": {
    "runId": "abc123",
    "model": "claude-sonnet-4-20250514",
    "provider": "anthropic",
    "tokens": { "input": 1234, "output": 567 },
    "channel": "whatsapp",          // only for channel sessions
    "toolCalls": [                   // only when tools were invoked
      { "name": "read", "args": { "path": "/tmp/foo.txt" } },
      { "name": "exec", "args": { "command": "ls" } }
    ],
    "thinking": "reasoning text..."  // only when thinking blocks present (truncated at 4K chars)
  }
}
```

**Media transforms** are persisted as system messages with `metadata.type = 'media_transform'` so audio transcriptions (Whisper) and image descriptions (Vision) survive in session history and are available for training data extraction.

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
