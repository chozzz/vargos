# Feature Inventory

## Core Agent Runtime

| Feature | Status | Location |
|---------|--------|----------|
| Pi SDK integration | ✅ | `runtime.ts` |
| Per-session message queue | ✅ | `queue.ts` |
| Retryable error detection + retry | ✅ | `runtime.ts` |
| Thinking-only response handling | ✅ | `runtime.ts` |
| Run abort API | ✅ | `service.ts` |
| Token usage tracking | ✅ | `runtime.ts` |

## System Prompt

| Feature | Status |
|---------|--------|
| Bootstrap file injection (AGENTS, SOUL, TOOLS) | ✅ |
| Prompt modes: full, minimal, minimal-subagent, none | ✅ |
| Channel context (concise, no-code, plain-text) | ✅ |
| Orchestration guidance (delegate vs act) | ✅ |
| Tool narration guidance (reduce verbosity) | ✅ |

## Context Management

| Feature | Status |
|---------|--------|
| History turn limiting (cron:10, channel:30, default:50) | ✅ |
| History sanitization (tool pairing, merge consecutive) | ✅ |
| Token-budget pruning (50% context window) | ✅ |
| Tool result truncation (head+tail, 30% cap) | ✅ |
| Context pruning extension (soft trim + hard clear) | ✅ |
| Compaction safeguard (hierarchical summarization) | ✅ |
| Subagent announcement injection | ✅ |

## Model Management

| Feature | Status |
|---------|--------|
| Model profiles with provider/credentials/limits | ✅ |
| Fallback models (primary + fallback) | 🔧 |
| Media type routing (audio/image/video) | ✅ |
| Local provider support (Ollama, LM Studio, OpenRouter) | ✅ |
| Custom base URLs | ✅ |

## Tool System

| Feature | Status |
|---------|--------|
| Tool registry with extension groups | ✅ |
| Pi SDK tool wrapping | ✅ |
| Tool formatting (formatCall/formatResult) | ✅ |
| Skills directory (SKILL.md discovery, skill_load tool) | ✅ |

## File System Tools

| Feature | Status |
|---------|--------|
| read, write, edit, exec | ✅ |

## Web Tools

| Feature | Status |
|---------|--------|
| web_fetch (HTTP with HTML to markdown) | ✅ |
| Browser automation (Playwright, auth, idle cleanup) | ✅ |

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
| JSONL file storage | ✅ |
| Hierarchical session keys | ✅ |
| Session types (main, cron, subagent, webhook) | ✅ |
| Session reaper (TTL: cron 7d, subagent 3d) | ✅ |
| Training data enrichment (tool calls, thinking, tokens, model) | ✅ |
| Media transcription persistence | ✅ |

## Sub-agent Orchestration

| Feature | Status |
|---------|--------|
| sessions_spawn with depth/breadth limits | ✅ |
| Run timeouts (default 300s) | ✅ |
| Result announcement (debounced 3s re-trigger) | ✅ |
| Minimal prompt mode for sub-agents | ✅ |

## Channels

| Feature | Status |
|---------|--------|
| WhatsApp (Baileys, QR auth, multi-device) | ✅ |
| Telegram (Bot API, long-polling) | ✅ |
| Message deduplication (2min TTL) | ✅ |
| Message debouncing (configurable, media flush) | ✅ |
| Chat directives (/think, /verbose per-message) | ✅ |
| Typing indicators (circuit breaker, TTL auto-stop) | ✅ |
| Status reactions | ✅ |
| User allowlisting | ✅ |
| Media extraction + channel_send_media tool | ✅ |
| Channel onboarding (interactive QR/token setup) | ✅ |

## Media

| Feature | Status |
|---------|--------|
| Audio transcription (OpenAI Whisper) | ✅ |
| Image description (OpenAI/Anthropic Vision) | ✅ |
| Media type routing | ✅ |
| Media file saving | ✅ |
| Link understanding (auto-expand URLs in messages) | ✅ |

## Cron & Scheduling

| Feature | Status |
|---------|--------|
| Cron expressions (5-field) | ✅ |
| CRUD operations (add/update/remove/run) | ✅ |
| Notify targets (deliver results to channels) | ✅ |
| Heartbeat with active hours filtering | ✅ |
| HEARTBEAT_OK token for "nothing to report" | ✅ |

## Gateway

| Feature | Status |
|---------|--------|
| WebSocket gateway (port 9000) | ✅ |
| Service registry + RPC routing | ✅ |
| Event broadcasting (pub/sub) | ✅ |
| Auto-reconnect with exponential backoff | ✅ |
| Structured retry with backoff + jitter | ✅ |
| Ping keep-alive (30s) | ✅ |

## MCP Bridge

| Feature | Status |
|---------|--------|
| MCP server (stdio + HTTP on port 9001) | ✅ |
| Tool listing + execution via MCP protocol | ✅ |
| MCP client manager (external MCP servers) | ✅ |
| OpenAPI spec generation | ✅ |

## Webhooks

| Feature | Status |
|---------|--------|
| HTTP webhook receiver (port 9002) | ✅ |
| HMAC token auth | ✅ |
| Custom JS/TS transforms | ✅ |
| Fire-and-forget agent runs | ✅ |

## CLI

| Feature | Status |
|---------|--------|
| Interactive menu (data-driven tree) | ✅ |
| Chat mode | ✅ |
| Session debug | ✅ |
| Config management | ✅ |
| Health check | ✅ |
| Onboarding: media/voice setup wizard | ✅ |
| Onboarding: LLM credential verification | ✅ |

## Security

| Feature | Status |
|---------|--------|
| MCP HTTP bearer token authentication | ✅ |
| Config file permissions (0o600, owner-only) | ✅ |
| Error sanitization (API keys/tokens scrubbed from logs) | ✅ |
| Centralized error store (append-only JSONL, auto-classified) | ✅ |
| User-facing error classification (auth/timeout/transient) | ✅ |
| Browser random session IDs | ✅ |
| LLM credential verification during onboarding | ✅ |
| Embedding config validation (warn on missing key) | ✅ |
| PostgreSQL → SQLite graceful fallback | ✅ |

## Training Data

| Feature | Status |
|---------|--------|
| Run metadata on assistant messages (model, provider, tokens, duration) | ✅ |
| Tool call capture (name + args for every tool invocation) | ✅ |
| Thinking block extraction (truncated at 4K chars) | ✅ |
| Channel context tagging | ✅ |
| Media transform persistence (audio transcription, image description) | ✅ |
| Training data export pipeline | 📋 |

## Planned

| Feature | Status |
|---------|--------|
| Session cost tracking | 📋 |
