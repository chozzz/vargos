# Sessions

Sessions persist conversation history and provide isolation between different interaction contexts.

## Session Key Formats

| Format | Example | Created By |
|--------|---------|-----------|
| `<instanceId>:<userId>` | `whatsapp-personal:61423222658` | Channel adapter |
| `<instanceId>:<userId>` | `telegram-bot:123456` | Channel adapter |
| `cron:<taskId>:<date>` | `cron:daily-report:2026-04-10` | Cron service |
| `webhook:<hookId>:<timestamp>` | `webhook:github-pr:1708865234567` | Webhook service |
| `<parent>:subagent` | `whatsapp-personal:61423222658:subagent` | `agent.execute` with subagent key |

Channel session keys use the channel's `instanceId` (from `config.channels[].id`) — not the platform type. This supports multiple instances of the same platform.

Session key builder functions live in `lib/subagent.ts`: `channelSessionKey()`, `cronSessionKey()`, `webhookSessionKey()`.

## Subagent Orchestration

Subagents are created by calling `agent.execute` with a child session key. No separate `agent.spawn` endpoint is needed.

```typescript
// Parent creates subagent via session key convention
const childKey = `${parentKey}:subagent`;
// → "whatsapp-personal:61423222658:subagent"

await bus.call('agent.execute', { sessionKey: childKey, task: 'Research this topic' });
```

Subagent depth is determined by counting `:subagent` suffixes in the session key.

## Session Isolation

Each session key maps to an independent conversation. Sessions do **not** share history:

- Cron jobs use `cron:<taskId>:<date>` — fresh session per fire
- Cron results are delivered only to explicit `notify` targets configured per task
- Cross-session context is possible through workspace files (memory files, MEMORY.md)

## Storage

Sessions are persisted by PiAgent's `SessionManager` to `~/.vargos/workspace/sessions/<sessionKey>/`.

```
~/.vargos/workspace/sessions/
├── whatsapp-personal:61423222658/
│   └── ... (PiAgent session files)
├── cron:daily-report:2026-04-10/
│   └── ... (PiAgent session files)
└── whatsapp-personal:61423222658:subagent/
    └── ... (PiAgent session files)
```

The Pi SDK's `SessionManager` handles persistence automatically — entries are written to disk and reloaded on session creation. No manual history injection is needed.

## Lifecycle

- **Channel sessions** (`<instanceId>:<userId>`) are keyed by sender ID per instance — one session per contact per channel instance
- **Cron sessions** (`cron:<taskId>:<date>`) get a fresh session per fire via date suffix
- **Webhook sessions** (`webhook:<hookId>:<ts>`) get a fresh session per fire via timestamp suffix
- **Subagent sessions** (`*:subagent`) are created dynamically by parent agents for child task execution

## Streaming Events

Agent v2 emits streaming events to the bus during execution:

| Event | Emitted When |
|-------|-------------|
| `agent.onDelta` | Text streaming delta from PiAgent |
| `agent.onTool` | Tool execution start/end |
| `agent.onCompleted` | Session finished (success or error) |

These are mapped from PiAgent's internal events in `subscribeToSessionEvents()`:
- `message_update` → `agent.onDelta`
- `tool_execution_start` / `tool_execution_end` → `agent.onTool`
- `agent_end` / `turn_end` → `agent.onCompleted`

See [runtime.md](./runtime.md) for agent execution details.
