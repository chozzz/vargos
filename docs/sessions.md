# Sessions

Sessions persist conversation history and provide isolation between different interaction contexts.

## Session Types

| Prefix | Source | Example |
|--------|--------|---------|
| `cli:` | Terminal chat | `cli:chat` |
| `cli:run:*` | One-shot tasks | `cli:run:1708123456789` |
| `mcp:` | MCP client connections | `mcp:client-1` |
| `wa:` | WhatsApp conversations | `wa:+1234567890` |
| `tg:` | Telegram conversations | `tg:987654321` |
| `*:subagent:*` | Background agent tasks | `cli:subagent:analyze-code` |
| `cron:*` | Scheduled tasks | `cron:daily-report:1708123456789` |

## Storage

Sessions are stored as JSONL files in `~/.vargos/sessions/`. Each file contains:
- Line 0: session metadata (key, kind, timestamps)
- Remaining lines: individual messages (role, content, timestamp)

File names are base64url-encoded session keys.

## Lifecycle

```
Create session (idempotent)
    |
    v
Add messages (user → assistant turns)
    |
    v
Persist to JSONL on each message
    |
    v
Resume on next interaction (same session key)
```

- Chat sessions (`cli:chat`) persist across restarts — resume where you left off.
- Run sessions (`cli:run:*`) use unique timestamps, so history doesn't accumulate.
- Channel sessions (`wa:*`, `tg:*`) are keyed by sender ID — one session per contact.

## Cron Sessions

The cron service creates a unique session per execution:

```
Cron trigger
    |
    v
Create session (cron:<task-id>:<timestamp>)
    |
    v
Agent executes with full tool access
    |
    v
Results stored in session transcript
```

Tasks are added at runtime via the `cron_add` tool or `vargos cron` commands.

## Message Queue

Messages are serialized per session — only one agent run executes per session at a time. Concurrent messages to the same session are queued and processed in order.

See [runtime.md](./runtime.md) for agent execution details.
