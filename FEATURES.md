# Feature Inventory

Source-of-truth status for every Vargos feature. Cross-reference with `gateway/events.ts` (the bus EventMap) and `boot.ts` (boot order — `index.ts` is the supervisor that spawns it).

Legend: ✅ shipped · 🟧 partial / disabled at boot · 📋 planned

## Core Agent Runtime

Pi-SDK-powered runtime (`@mariozechner/pi-coding-agent`) with Vargos-managed config, sessions, and bus tools.

| Feature | Status | Location |
|---------|--------|----------|
| `agent.execute` RPC with Zod-validated metadata | ✅ | `services/agent/index.ts` |
| Session cache (in-memory `Map<sessionKey, AgentSession>`) | ✅ | `services/agent/index.ts` |
| `agent.appendMessage` for skipAgent / cross-session injection | ✅ | `services/agent/index.ts` |
| `agent.status` — currently active runs | ✅ | `services/agent/index.ts` |
| Inference error surfacing — `success: false` on `stopReason === 'error'` | ✅ | `services/agent/index.ts` |
| Custom tools from bus events (auto-wrapped) | ✅ | `services/agent/tools.ts` |
| Streaming events to bus (`agent.onDelta`, `agent.onTool`, `agent.onCompleted`) | ✅ | `services/agent/index.ts` |
| Subagent orchestration via nested `agent.execute` (`<parent>:subagent:<child>` keys) | ✅ | `lib/subagent.ts` |
| Chat directives (`/think:<level>`, `/verbose`) | ✅ | `services/agent/directives.ts` |

## System Prompt

| Feature | Status |
|---------|--------|
| Bootstrap files merged from workspace + cwd: `AGENTS.md`, `SOUL.md`, `TOOLS.md` | ✅ |
| 6K char head/tail truncation per file | ✅ |
| Pi SDK auto-discovers cwd-tree `AGENTS.md` separately as `# Project Context` | ✅ |
| Skills metadata block (Pi SDK injects name + description + location) | ✅ |
| Channel persona body appended after bootstrap | ✅ |
| Interpolation: `${WORKSPACE_DIR}`, `${DATA_DIR}`, `${SESSION_KEY}`, `${CHANNEL_ID}`, `${CHAT_ID}`, `${USER_ID/NAME/HANDLE}`, `${BOT_ID/NAME/HANDLE}`, `${CURRENT_DATE}`, `${CURRENT_TIMEZONE}`, `${VAR:-default}` | ✅ |

## Channel Personas

| Feature | Status |
|---------|--------|
| Per-channel persona file `~/.vargos/agents/<channelId>.md` (auto-seeded from `default.md`) | ✅ |
| Frontmatter `allowedTools: string[]` glob whitelist (e.g. `memory.*`) | ✅ |
| Body appended to channel sessions' system prompt | ✅ |
| Generic frontmatter parser (`parseFrontmatter<T>`) with smart YAML quoting on serialize | ✅ |

## Channels

| Feature | Status |
|---------|--------|
| Telegram (Bot API, long-polling, IPv4 forced) | ✅ |
| WhatsApp (Baileys, QR auth, multi-device) | ✅ |
| Multi-instance channels (named `id` + `type` per entry) | ✅ |
| Per-channel `model`, `cwd`, `debounceMs` | ✅ |
| Whitelist enforcement (`allowFrom`) | ✅ |
| Group-chat support with mention-only listening (`isMentioned` filter) | ✅ |
| Message deduplication (2 min TTL) | ✅ |
| Message debouncing (configurable, media flush) | ✅ |
| Typing indicators (circuit breaker + TTL auto-stop) | ✅ |
| Status reactions (queued → thinking → tool → done/error) | ✅ |
| Boot resilience — channel failure doesn't abort others | ✅ |
| Link expansion (auto-fetch URLs in messages) | ✅ |
| Markdown stripping on outbound text | ✅ |
| `channel.send` with `fromSessionKey` — cross-session history injection (cron, webhook, agent forwards) | ✅ |
| Document extraction (PDF/DOCX/XLSX/TXT/MD) | ✅ Telegram · 🟧 WhatsApp deferred |
| Sender + bot identity in metadata (id / name / handle) | ✅ |

## Media

| Feature | Status |
|---------|--------|
| Audio transcription (OpenAI Whisper) | ✅ |
| Image passthrough to vision models | ✅ |
| Document extraction (`media.extractDocument`) | ✅ |
| Inbound media saving | ✅ |
| Auto-transcription/description before agent run | ✅ |

## Memory & Knowledge

| Feature | Status |
|---------|--------|
| Hybrid search (embeddings + BM25) — `memory.search` | ✅ |
| Read/write/stats — `memory.read`, `memory.write`, `memory.stats` | ✅ |
| SQLite + PostgreSQL/pgvector backends | ✅ |
| Embedding providers (OpenAI, trigram, none) | ✅ |
| File watcher for auto-indexing | ✅ |
| Session indexer (chunks JSONL into searchable history) | ✅ |

## Sessions

| Feature | Status |
|---------|--------|
| Pi SDK `SessionManager` JSONL persistence | ✅ |
| Session keys: `<channelId>:<userId>`, `cron:<task>:<YYYY-MM-DD>`, `webhook:<id>:<ms>`, `<parent>:subagent:<child>` | ✅ |
| Storage: `~/.vargos/sessions/<sessionKey-with-/-instead-of-:>/<timestamp>_<uuid>.jsonl` | ✅ |
| Idle cleanup (sessions stay alive after `agent_end` for follow-up) | ✅ |
| Subagent depth/breadth limits + run timeout | ✅ |

## Cron & Scheduling

| Feature | Status |
|---------|--------|
| File-based tasks at `~/.vargos/cron/<id>.md` (frontmatter + prompt body) | ✅ |
| `cron.search`, `cron.add`, `cron.update`, `cron.remove`, `cron.run` | ✅ |
| Notify targets — `channel.send` with `fromSessionKey` for history continuity | ✅ |
| Heartbeat task (active-hours filter, `HEARTBEAT_OK` token pruning, history-injection skipped) | ✅ |
| Per-task model override | ✅ |
| Concurrency lock per task (`activeTasks` set) | ✅ |

## Templates & Seeding

| Feature | Status |
|---------|--------|
| `.templates/` tree recursively seeded into `~/.vargos/` at startup (copy-missing only) | ✅ |
| `pnpm seed` for manual re-seed | ✅ |
| Bundled templates: `workspace/{AGENTS,SOUL,TOOLS,MEMORY,HEARTBEAT}.md`, `cron/heartbeat.md`, `agents/default.md`, `agent/skills/skill-creator/SKILL.md` | ✅ |
| Auto-create `~/.vargos/{workspace,sessions,channels,cron,logs}/` on first boot | ✅ |
| Auto-create `~/.vargos/agents/<channelId>.md` per configured channel at boot | ✅ |

## Skills

| Feature | Status |
|---------|--------|
| Pi SDK auto-discovery: `<agentDir>/skills/`, `<cwd>/.pi/skills/` | ✅ |
| Vargos additional paths via `lib/skills.ts` `resolveSkillPaths`: `<workspaceDir>/skills/`, `<cwd>/skills/` | ✅ |
| Bundled `skill-creator` skill at `.templates/agent/skills/skill-creator/SKILL.md` | ✅ |
| Skills metadata in system prompt (description-first, body via `read` tool on demand) | ✅ |

## Model Management

| Feature | Status |
|---------|--------|
| Pi SDK `ModelRegistry` from `~/.vargos/agent/models.json` | ✅ |
| Pi SDK `AuthStorage` from `~/.vargos/agent/auth.json` (oauth + API key) | ✅ |
| `provider:modelId` format with thinking-level shorthand (`sonnet:high`) | ✅ |
| Per-channel and per-cron `model` override | ✅ |
| Local providers (Ollama, LM Studio, vLLM) | ✅ |
| Env override `${PROVIDER}_API_KEY` | ✅ |

## Tool System

| Feature | Status |
|---------|--------|
| Bus tools auto-discovered from `@register` decorators | ✅ |
| Pi SDK tool wrapping via `createCustomTools` | ✅ |
| Pi SDK built-ins: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls` | ✅ |
| Persona `allowedTools` glob filter applied to custom tools | ✅ |
| `web.fetch` (HTTP → markdown extraction) | ✅ |

## Gateway

| Feature | Status |
|---------|--------|
| Typed `EventEmitterBus` (RPC + pub/sub) | ✅ |
| `@on` (listener) + `@register` (RPC tool) decorators | ✅ |
| Auto-bootstrap on service `bus.bootstrap(this)` | ✅ |
| `bus.search`, `bus.inspect` introspection | ✅ |
| TCP/JSON-RPC server on port 9000 (NOT HTTP) | ✅ |
| Domain boundaries enforced via ESLint `no-restricted-imports` | ✅ |

## CLI

| Feature | Status |
|---------|--------|
| `pnpm start` — boot gateway + all services | ✅ |
| `pnpm chat` — Pi SDK CLI bound to `~/.vargos/agent` and sessions in `sessions/cli/` | ✅ |
| `pnpm cli` — Vargos management CLI (start, onboard, config) | ✅ |
| `pnpm seed` — manual `seedDataDir()` invocation | ✅ |

## MCP Bridge

| Feature | Status |
|---------|--------|
| MCP **client** (external MCP servers loaded as bus tools) | ✅ `services/mcp-client/` |
| MCP **server** (HTTP, port 9001, expose Vargos as MCP) | 🟧 commented out in `boot.ts` |

## Webhooks

| Feature | Status |
|---------|--------|
| HTTP webhook receiver (port 9002) | 🟧 commented out in `boot.ts` |
| HMAC token auth | 🟧 |
| Custom JS/TS transforms | 🟧 |
| `notify` delivery via `channel.send` with `fromSessionKey` | ✅ when re-enabled |

## Security

| Feature | Status |
|---------|--------|
| Config file permissions (0o600, owner-only) | ✅ |
| Whitelist enforcement (`channel.allowFrom`) | ✅ |
| Persona `allowedTools` glob whitelist (per-channel tool restriction) | ✅ |
| Error sanitization (API keys/tokens scrubbed) | ✅ |
| Centralized error store (append-only JSONL) | ✅ |
| Pre-commit hook: PII / secret detection | ✅ |
| Pre-push hook: blocks `git push origin main` | ✅ |

## Planned

| Feature | Status |
|---------|--------|
| Voice integration (STT/TTS via LocalAI) | 📋 |
| Twilio phone channel adapter + outbound voice calls | 📋 |
| Slack channel adapter | 📋 |
| Web UI / Observability service | 📋 |
| Session cost tracking | 📋 |
| Image description fallback (for non-vision models) | 📋 |
| Session export/import | 📋 |
| Re-enable `edge/webhooks/` and `edge/mcp/` at boot | 📋 |

## Known Limitations

- **Transcription failures are silent** — if Whisper fails, the agent receives the file path instead of the transcript. Logs a warning. Fix planned: surface to user with "Transcription failed" message.
- **No image size limits** — large images go to vision models without resize. Models reject oversized images gracefully.
- **No outbound media format validation** — channel adapters accept any image/audio format. `transcribeAudio` auto-corrects extensions; other paths rely on the model.
- **Per-session concurrency** — Pi SDK handles concurrent prompts on the same session via `streamingBehavior: 'steer'` (interrupts in-flight). Per-session queueing is not implemented at the Vargos layer.
