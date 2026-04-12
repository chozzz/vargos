# Feature Inventory

## Core Agent Runtime (v2)

Agent v2 is a **PiAgent-powered runtime** that replaces the old agent service. It provides direct channel integration via `bus.call('agent.execute')`, PiAgent session persistence, vision model support, audio transcription, and streaming events passthrough.

| Feature | Status | Location |
|---------|--------|----------|
| PiAgent session persistence | ✅ | `services/agent/index.ts` |
| `agent.execute` RPC with schema validation | ✅ | `services/agent/index.ts` |
| Session management (create/get/cache) | ✅ | `services/agent/index.ts` |
| Model registration via `ModelRegistry` | ✅ | `services/agent/index.ts` |
| API key management via `AuthStorage` | ✅ | `services/agent/index.ts` |
| Settings sync via `SettingsManager` | ✅ | `services/agent/index.ts` |
| Skills loading via `loadSkillsFromDir` | ✅ | `services/agent/index.ts` |
| Custom tools from bus events | ✅ | `services/agent/tools.ts` |
| System prompt from workspace files | ✅ | `services/agent/index.ts` |
| Image passthrough to PiAgent (vision) | ✅ | `services/agent/index.ts` |
| Audio transcription (Whisper API) | ✅ | `lib/media-transcribe.ts` |
| Streaming events passthrough to bus | ✅ | `services/agent/index.ts` |
| Debug mode (`AGENT_DEBUG=true`) | ✅ | `services/agent/index.ts` |
| Subagent orchestration via `agent.execute` | ✅ | `lib/subagent.ts` |

## System Prompt

| Feature | Status |
|---------|--------|
| Bootstrap file injection (CLAUDE.md, AGENTS.md, SOUL.md, TOOLS.md) | ✅ |
| Skills manifest injection | ✅ |
| 6K char limit per file with head/tail truncation | ✅ |
| Workspace + cwd merging | ✅ |

## Context Management

| Feature | Status |
|---------|--------|
| PiAgent `SessionManager` handles persistence | ✅ |
| PiAgent compaction (hierarchical summarization) | ✅ |
| History turn limiting (by session type) | ✅ |
| Token-budget pruning (50% context window) | ✅ |
| Tool result truncation (head+tail, 30% cap) | ✅ |

## Model Management

| Feature | Status |
|---------|--------|
| Provider:modelId format (`openrouter:minimax/m2.7`) | ✅ |
| Provider API keys and base URLs | ✅ |
| Per-channel model override | ✅ |
| Chat directives (`/think:<level>`, `/verbose`) | ✅ |
| Local providers (Ollama, LM Studio) | ✅ |
| Custom base URLs | ✅ |

## Tool System

| Feature | Status |
|---------|--------|
| Bus tools — auto-discovered from `@register` decorators | ✅ |
| PiAgent tool wrapping via `createCustomTools` | ✅ |
| Tool result formatting + large-result warnings | ✅ |
| Error classification + error store | ✅ |
| Skills directory (SKILL.md discovery) | ✅ |

## File System Tools

| Feature | Status |
|---------|--------|
| read, write, edit, exec | ✅ |

## Web Tools

| Feature | Status |
|---------|--------|
| web.fetch (HTTP with HTML to markdown) | ✅ |

## Memory & Knowledge

| Feature | Status |
|---------|--------|
| Hybrid search (embeddings + BM25) | ✅ |
| Multiple backends (SQLite, PostgreSQL/pgvector) | ✅ |
| Multiple embedding providers (OpenAI, trigram, none) | ✅ |
| File watcher for auto-indexing | ✅ |
| Session indexing | ✅ |

## Sessions

| Feature | Status |
|---------|--------|
| PiAgent `SessionManager` persistence | ✅ |
| Hierarchical session keys (`channel:userId`, `cron:task:date`, `parent:subagent:ts`) | ✅ |
| Session types (main, cron, subagent, webhook) | ✅ |
| Subagent depth/breadth limits | ✅ |
| Subagent run timeouts (default 300s) | ✅ |

## Channels

| Feature | Status |
|---------|--------|
| WhatsApp (Baileys, QR auth, multi-device) | ✅ |
| Telegram (Bot API, long-polling, IPv4 forced) | ✅ |
| Multi-instance channels (named id + type per entry) | ✅ |
| Per-channel model override | ✅ |
| Message deduplication (2min TTL) | ✅ |
| Message debouncing (configurable, media flush) | ✅ |
| Chat directives (/think, /verbose per-message) | ✅ |
| Typing indicators (circuit breaker, TTL auto-stop) | ✅ |
| Status reactions (queued → thinking → tool → done/error) | ✅ |
| User allowlisting (WhatsApp + Telegram) | ✅ |
| Boot resilience — channel failure doesn't abort others | ✅ |
| Media extraction + channel_send_media tool | ✅ |
| Shared inbound media pipeline (InboundMediaHandler) | ✅ |
| Link expansion (auto-fetch URLs in messages) | ✅ |
| Markdown stripping on outbound text | ✅ |

## Media

| Feature | Status |
|---------|--------|
| Audio transcription (OpenAI Whisper) | ✅ |
| Image passthrough (vision models) | ✅ |
| Media file saving | ✅ |
| Link understanding (auto-expand URLs) | ✅ |

## Cron & Scheduling

| Feature | Status |
|---------|--------|
| Cron expressions (5-field) | ✅ |
| CRUD operations (add/update/remove/run) | ✅ |
| Notify targets (deliver results to channels) | ✅ |
| Heartbeat with active hours filtering | ✅ |
| HEARTBEAT_OK token pruning | ✅ |
| Error review (daily cron, pattern grouping) | ✅ |

## Gateway

| Feature | Status |
|---------|--------|
| Typed EventEmitterBus (RPC + pub/sub) | ✅ |
| `@on` (listener) + `@register` (RPC tool) decorators | ✅ |
| Service bootstrap — auto-wiring at boot | ✅ |
| Bus introspection (`bus.search`, `bus.inspect`) | ✅ |
| TCP/JSON-RPC server (port 9000) | ✅ |
| Domain boundary enforcement via ESLint | ✅ |

## MCP Bridge

| Feature | Status |
|---------|--------|
| MCP server (HTTP on port 9001) | ✅ |
| Tool listing + execution via MCP protocol | ✅ |
| MCP client manager (external MCP servers) | ✅ |
| OpenAPI spec generation | ✅ |
| Bearer token authentication | ✅ |

## Webhooks

| Feature | Status |
|---------|--------|
| HTTP webhook receiver (port 9002) | ✅ |
| HMAC token auth | ✅ |
| Custom JS/TS transforms | ✅ |
| Fire-and-forget agent runs | ✅ |

## Security

| Feature | Status |
|---------|--------|
| Config file permissions (0o600, owner-only) | ✅ |
| Error sanitization (API keys/tokens scrubbed) | ✅ |
| Centralized error store (append-only JSONL) | ✅ |
| User-facing error classification | ✅ |
| Structured retry with backoff + jitter | ✅ |

## CLI

| Feature | Status |
|---------|--------|
| Interactive menu (data-driven tree) | ✅ |
| Chat mode | ✅ |
| Config management | ✅ |
| Health check | ✅ |
| Onboarding: LLM credential verification | ✅ |

## Planned

| Feature | Status |
|---------|--------|
| Voice Integration (STT/TTS via LocalAI) | 📋 |
| Twilio phone channel adapter | 📋 |
| Outbound voice calls (phone_call tool) | 📋 |
| Guest voice agent plugins (hospitality) | 📋 |
| Web UI / Observability service (HTTP+SSE) | 📋 |
| Session cost tracking | 📋 |
| Image description fallback (for non-vision models) | 📋 |
| Model switching mid-session | 📋 |
| Session export/import | 📋 |
