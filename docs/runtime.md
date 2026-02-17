# Runtime

The agent runtime wraps the Pi SDK to execute LLM-powered agent sessions with tool access, streaming, and session management.

## Execution Flow

```
enqueue message (per-session serialization)
    |
    v
executeRun()
    |
    v
Open session file (JSONL) + sanitize history
    |
    v
Register model + create agent session
    |
    v
Build system prompt (first message only)
    |
    v
session.prompt(task, images?)
    |
    v
Stream deltas → lifecycle events
    |
    v
Store response → end run
```

## System Prompt

The system prompt is built in layers (full mode):

1. **Identity** — "You are Vargos, an AI Agentic Assistant"
2. **Tooling** — available tools with descriptions
3. **Workspace** — working directory path
4. **Project Context** — codebase detection (Vargos repo vs generic)
5. **Memory Recall** — how to use `memory_search` + `memory_get`
6. **Heartbeats** — heartbeat polling protocol
7. **Bootstrap Files** — project-specific context (see below)
8. **Behavior** — override rules (placed after bootstrap to take precedence)
9. **Tool Call Style** — suppress verbose narration
10. **Channel** — channel-specific instructions (if applicable)
11. **Date/Time** — timezone info
12. **Runtime** — host, model, thinking mode
13. **Additional Context** — extra system prompt if provided

### Prompt Modes

| Mode | When | Content |
|------|------|---------|
| `full` | Default (chat, channels) | All layers |
| `minimal` | Subagents, cron tasks | Bootstrap files only (AGENTS.md + TOOLS.md) |
| `none` | Custom prompts | No system prompt |

### Bootstrap Files

Loaded from the workspace directory, max 20,000 chars each:

| File | Purpose |
|------|---------|
| `ARCHITECTURE.md` | Project structure |
| `AGENTS.md` | Workspace rules |
| `SOUL.md` | Persona (embodied if present) |
| `TOOLS.md` | Tool usage notes |
| `USER.md` | User profile |
| `HEARTBEAT.md` | Heartbeat task definitions |
| `MEMORY.md` | Curated memories |
| `BOOTSTRAP.md` | First-run only (when no other files exist) |

Subagents receive only `AGENTS.md` and `TOOLS.md`.

## Streaming Events

The lifecycle emits typed events during execution:

| Event Type | Payload | Description |
|------------|---------|-------------|
| `lifecycle` | `{ phase, runId, sessionKey, tokens?, duration? }` | Run start/end/error/abort |
| `assistant` | `{ runId, delta }` | Text streaming delta |
| `tool` | `{ runId, name, args?, result? }` | Tool execution start/end |
| `compaction` | `{ runId, tokensBefore, summary }` | Context auto-compaction |

Lifecycle phases: `start` → `end` | `error` | `abort`.

## Message Queue

Messages are serialized per session via `SessionMessageQueue`:

- One agent run per session at a time
- Concurrent messages queued and processed in order
- Each enqueue returns a promise that resolves when processed
- Queue can be cleared (rejects pending messages)

## Model Registration

The runtime registers models with the Pi SDK:

- Built-in providers use their default endpoints
- Custom providers (OpenRouter, Groq, Together, etc.) register dynamically with `openai-completions` API
- Local providers (Ollama, LM Studio) need a dummy `"local"` API key

Supported providers: `anthropic`, `openai`, `google`, `openrouter`, `ollama`, `lmstudio`, `groq`, `together`, `deepseek`, `mistral`, `fireworks`, `perplexity`.

## Subagents

`sessions_spawn` creates an isolated session and runs the agent:

- Unique session key: `<parent>:subagent:<label>`
- Minimal prompt mode (only AGENTS.md + TOOLS.md)
- Cannot spawn further subagents (prevents recursion)
- Result announced to parent session on completion

## Thinking-Only Responses

When the model returns only thinking tokens (no text content), the runtime treats it as a successful empty response and skips delivery. This avoids errors when models "think" without producing output.

See [extensions.md](./extensions.md) for tool details, [architecture.md](./architecture.md) for protocol spec.
