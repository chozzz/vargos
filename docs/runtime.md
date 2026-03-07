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
In-memory Pi session + load history from FileSessionService
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

1. **Identity** — delegates persona to SOUL.md
2. **Tooling** — available tools with descriptions
3. **Workspace** — working directory path
4. **Project Context** — codebase detection (Vargos repo vs generic)
5. **Memory Recall** — how to use `memory_search` + `memory_get`
6. **Heartbeats** — heartbeat polling protocol
7. **Bootstrap Files** — AGENTS.md, SOUL.md, TOOLS.md, HEARTBEAT.md
8. **Tool Call Style** — suppress verbose narration
9. **Channel** — channel-specific instructions (if applicable)
10. **System** — date/time, host, model, thinking mode
11. **Additional Context** — extra system prompt if provided

### Prompt Modes

| Mode | When | Content |
|------|------|---------|
| `full` | Default (chat, channels, subagents) | All layers |
| `minimal` | Cron tasks | Bootstrap files only |
| `none` | Custom prompts | No system prompt |

### Bootstrap Files

Loaded from the workspace directory, max 20,000 chars each (70/20 head/tail truncation):

| File | Purpose |
|------|---------|
| `AGENTS.md` | Workspace rules, memory conventions, communication etiquette |
| `SOUL.md` | Persona, identity, boundaries, user profile |
| `TOOLS.md` | Environment-specific notes (IPs, devices, commands) |
| `HEARTBEAT.md` | Periodic maintenance tasks for heartbeat cron |

`MEMORY.md` is not auto-injected — the agent retrieves it on-demand via `memory_search` / `memory_get`.

Subagents receive the full set of bootstrap files, same as their parent.

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

- Unique session key: `<parent>:subagent:<timestamp>-<rand>`
- Full prompt mode (same as parent)
- History limit inherited from root session type
- All tools available (no deny list)
- Can spawn children up to depth 3 (depth-limited)
- On completion: result announced to parent session, parent re-triggered if channel-rooted, reply delivered through the channel

## Thinking-Only Responses

When the model returns only thinking tokens (no text content), the runtime treats it as a successful empty response and skips delivery. This avoids errors when models "think" without producing output.

See [extensions.md](./extensions.md) for tool details, [architecture.md](./architecture.md) for protocol spec.
