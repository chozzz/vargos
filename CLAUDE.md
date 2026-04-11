# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vargos is a self-hosted agent OS built in TypeScript/Node.js. It gives LLM agents persistent memory, multi-channel presence (WhatsApp, Telegram, CLI), tool access, scheduled autonomy, and sub-agent orchestration — all over a local TCP gateway on your hardware.

See [FEATURES.md](./FEATURES.md) for a full feature inventory and status.

## Commands

```bash
# Package manager: pnpm
pnpm install                # install deps (postinstall rebuilds better-sqlite3)

# Run
pnpm start                  # start gateway + all services (tsx index.ts)

# Build & check
pnpm build                  # tsc
pnpm run typecheck          # tsc --noEmit

# Test (vitest, co-located *.test.ts files)
pnpm test                   # watch mode
pnpm run test:run           # single run
# Run a single test file:
npx vitest run services/config/__tests__/e2e/config.e2e.test.ts

# Lint
pnpm lint                   # eslint + typecheck
```

## Architecture

### Event Bus Gateway

Services communicate exclusively through a typed **EventEmitterBus** (`gateway/emitter.ts`) wired at boot. No shared state or cross-domain imports. Single source of truth for all contracts in `gateway/events.ts`.

Event shapes:
- **Pure events** — flat payload, use `bus.emit(event, payload)` / `@on` decorator
- **Callable events** — {params, result}, use `bus.call(event, params)` / `@register` decorator + schema

Services wire decorated methods via `bus.bootstrap(service)` at boot. RPC is exposed over TCP/JSON-RPC (`gateway/tcp-server.ts`, default port 9000) for CLI access.

### Boot Sequence (`index.ts`)

```
config → log → fs → web → workspace → memory → agent-v2 → [cron → channels → webhooks → mcp] → [tcp server start] → bus.onReady emit
```

Services in brackets are currently commented out pending integration. Each service:
1. Extends a class with `@on` and `@register` decorated methods
2. Exports a `boot(bus)` function that instantiates the service and calls `bus.bootstrap(this)`
3. Optionally returns a `stop()` function for graceful shutdown

### Services

| Service | Directory | Callable Events | Pure Events |
|---------|-----------|-----------------|-------------|
| **config** | `services/config/` | config.get, config.set | config.onChanged |
| **log** | `services/log/` | log.search | log.onLog |
| **fs** | `services/fs/` | fs.read, fs.write, fs.edit, fs.exec | — |
| **web** | `services/web/` | web.fetch | — |
| **workspace** | `services/workspace/` | workspace.listSkills, workspace.loadSkill | — |
| **memory** | `services/memory/` | memory.search, memory.read, memory.write, memory.stats | — |
| **agent-v2** | `services/agent-v2/` | agent.execute, agent.abort, agent.status, agent.process-retriggers, model.register, media.transform | agent.onDelta, agent.onTool, agent.onCompleted, agent.compaction |
| **cron** | `services/cron/` | cron.search, cron.add, cron.remove, cron.update, cron.run | — |
| **channels** | `services/channels/` | channel.send, channel.sendMedia, channel.search, channel.get, channel.register | channel.onConnected, channel.onDisconnected, channel.onInbound |

### Agent Runtime (v2)

`AgentRuntime` (`services/agent-v2/index.ts`) wraps `@mariozechner/pi-coding-agent`. Session persistence, history management, and compaction are handled by the Pi SDK's `SessionManager` and `DefaultResourceLoader` — there is no separate sessions service.

**Key components** (`services/agent-v2/`):
- `index.ts` — `AgentRuntime` class with `@register` handlers for `agent.execute`, `agent.abort`, `agent.status`, `agent.process-retriggers`, `model.register`, and `media.transform`
- `tools.ts` — wraps bus callable events as PiAgent `ToolDefinition` objects
- `schema.ts` — `AgentDeps` type definition for runtime dependencies

**Model resolution**: `contextWindow` and `maxTokens` from the model profile in config are forwarded to the Pi SDK (defaults: 128K context, 16K output). API keys are resolved from env vars (`${PROVIDER}_API_KEY`) with fallback to the profile's `apiKey` field.

**Skills & prompts**: workspace skills from `~/.vargos/workspace/skills/` are loaded via the Pi SDK's `loadSkillsFromDir` and injected into the system prompt via `formatSkillsForPrompt`.

**Directives**: chat directives (`/think:<level>`, `/verbose`) are parsed and stripped before the task reaches the agent via `parseDirectives()` from `lib/directives.ts`.

### Tool System

Tools are organized in services under `services/`. Each tool implements:
```typescript
interface Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (args, context: ToolContext) => Promise<ToolResult>;
  formatCall?: (args) => string;
  formatResult?: (result) => string;
}
```

Callable events are discovered dynamically via `bus.search(query?)` and `bus.inspect(event)`. Tools are registered via `@register` decorators with a schema parameter.

### Channels (`services/channels/`)

Adapters implement `ChannelAdapter` (`services/channels/types.ts`). Base class (`services/channels/base-adapter.ts`) provides shared logic.

**Multi-instance config**: `config.channels` is an array of `ChannelEntry` objects. Each entry has `id` (unique instance name, e.g. `telegram-bakabit`) and `type` (platform, e.g. `telegram`). Multiple entries with the same `type` but different `id` are how you run two WhatsApp accounts or two Telegram bots. Session keys and adapter map keys use `id`, not `type`. Example:
```json
{ "id": "telegram-work", "type": "telegram", "botToken": "...", "allowFrom": ["..."] }
```

**Per-channel model**: add `"model": "<profile-name>"` to any channel entry to override `config.agent.model` for runs triggered from that channel. The profile must exist in `config.models`. Precedence: per-run `model` param > channel `model` > global `agent.model`.

**Thinking level**: `config.agent.thinkingLevel` sets the default (default: `high`). Controls extended thinking token budget per LLM call. Optional `config.agent.thinkingBudgets` sets per-level token caps (e.g. `{ low: 2048, medium: 8192, high: 16384 }`).

**Chat directives** (`lib/directives.ts`): Users can prefix messages with `/think:<level>` (off/low/medium/high) or `/verbose` to override per-message inference settings. Directives override the default thinking level for that message only. Directives are parsed and stripped in `AgentService` before the task reaches the agent — the agent never sees the raw directive tokens.

**Message debouncing**: `BaseChannelAdapter` uses `createMessageDebouncer` (`lib/debounce.ts`) to batch rapid messages from the same sender before triggering an agent run. Default delay is 2000ms; configurable per channel via `debounceMs` in `config.json`. Media messages (photo, audio, video) bypass the debouncer and flush any pending text immediately so they are processed in order.

**Typing indicators**: circuit breaker stops after 3 consecutive failures; TTL safety auto-stops after 120s to prevent zombie indicators.

**Status reactions** (`services/channels/status-reactions.ts`): `StatusReactionController` drives emoji reactions on the triggering message through agent phases: queued (👀) → thinking (🤔) → tool (🔧) → done (👍) / error (❗). Transient phases are debounced (500ms), terminal phases are immediate and seal the controller. Requires `react()` method on the adapter (implemented on WhatsApp via Baileys, Telegram via `setMessageReaction`).

**Link understanding** (`services/channels/link-expand.ts`): URLs in inbound channel messages are auto-expanded — fetched and appended as readable text under a `---\n[Expanded links]` separator. Configurable via `config.linkExpand`: `enabled`, `maxUrls` (default 3), `maxCharsPerUrl` (default 8000), `timeoutMs` (default 5000). Private/internal IPs are filtered out. Expansion failures are silently ignored.

**Media delivery**: Two mechanisms — `channel_send_media` tool (explicit, agent-initiated) and `extractMediaPaths` (passive regex fallback that scans `channel.send` text for file paths). The explicit tool is preferred; the passive path exists as a safety net.

**Markdown stripping** (`lib/strip-markdown.ts`): All outbound `channel.send` text passes through `stripMarkdown()` before delivery — deterministic plain-text conversion as a safety net regardless of model compliance. Strips headers, bold/italic, code blocks, links, blockquotes.

**System prompt for channels**: Uses sandwich pattern — channel rules appear in both the `## Channel` section (mid-prompt) and `## Reminder` section (end of prompt) to exploit LLM recency bias. Channel rules use positive framing ("Write in plain text") rather than negative ("No markdown") per prompting research.

**Event subscriptions**: channel service subscribes to `agent.onTool` (track tool phases for reactions), `agent.onCompleted` (stop typing + seal reactions).

### Heartbeat

Periodic maintenance cron configured under `config.heartbeat` (separate from `cron.tasks`). Registered as an ephemeral cron job at boot via `createHeartbeatTask()` in `services/cron/tasks/heartbeat.ts`. Default interval: every 30 minutes.

**Skip logic** (zero API cost when idle): skips if outside active hours, agent is busy, or HEARTBEAT.md is empty/comments-only.

**Architecture split**: AGENTS.md has permanent procedures (HOW), HEARTBEAT.md has the task queue (WHAT). Agent reads HEARTBEAT.md each poll, follows AGENTS.md for procedures.

**Transcript pruning**: HEARTBEAT_OK responses (no-op) are pruned from the cron session immediately to prevent context pollution. Only actionable responses are kept and delivered to `notify` targets.

### Cron Notifications

Cron tasks support an optional `notify` array of channel targets (e.g. `["whatsapp:61423222658"]`). After a run completes, results are delivered directly to each target via `channel.send`.

### Memory System (`services/memory/`)

Hybrid semantic + text search over `~/.vargos/workspace/*.md`. Chunks text, supports OpenAI embeddings (fallback: trigram-hash vectors) + BM25 scoring. Backends: SQLite (`better-sqlite3`) or PostgreSQL (pgvector).

### Error Handling & Retry

**Structured retry** (`lib/retry.ts`): `withRetry(fn, config)` wraps any async operation with exponential backoff and optional jitter. Config: `maxRetries` (default 3), `baseMs` (default 1000), `maxMs` (default 30_000), `jitter` (default true), `shouldRetry` predicate, `signal` for abort. The gateway auto-reconnect and other transient-failure paths use this utility.

**Retryable error detection**: `config.agent.maxRetryDelayMs` (default 30s) caps server-requested retry delays via the Pi SDK.

**Centralized error store** (`lib/error-store.ts`): `appendError()` persists classified errors to `~/.vargos/errors.jsonl` as append-only JSONL. Auto-classifies via `classifyError()`, sanitizes API keys. `readErrors({ sinceHours })` reads back entries with optional time filter. Hook points: runtime run failures, tool execution errors, gateway reconnect exhaustion.

**Error review**: seeded as a default cron task (`error-review`, daily at `0 20 * * *` UTC). Reads `errors.jsonl`, groups by pattern, writes findings to HEARTBEAT.md.

### Skills Directory

Reusable prompt recipes stored as `~/.vargos/workspace/skills/<name>/SKILL.md` with YAML frontmatter (name, description, tags). Loaded via the Pi SDK's `loadSkillsFromDir` at session creation. Agents can create new skills via `write` tool — they appear on the next run automatically. Scanner: `lib/skills.ts`.

## Planned Capabilities

The following features are confirmed in the roadmap but not yet implemented:

**Voice Integration** — STT/TTS bridge via LocalAI (port 8090). Transparent transcription of WhatsApp/Telegram voice notes; optional voice replies (`voiceReplyMode: always | mirror | never`). Twilio phone channel support with concurrent call sessions via Media Streams WebSocket.

**Outbound Voice Calls** — Tool-based model: `phone_call(to, instructions, persona?)` initiates Twilio call, spawns subagent session for autonomous voice conversation, returns transcript + summary. Use case: cron tasks that need to call and gather information.

**Guest Voice Agent Plugins** — Hospitality support: resolve caller ID → load guest profile + persona from `~/.vargos/workspace/guests/<id>.md` → voice session with shared hotel-concierge skill pack. Concurrent calls isolated per callSid.

**Web UI / Observability** — New `WebService` exposing agent runs, sessions, cron tasks, channels, memory, and config via HTTP + Server-Sent Events. Real-time streaming deltas and tool execution visibility. Same auth pattern as MCP bridge (bearer token).

## Domain Boundary Rules

ESLint enforces strict domain isolation via `no-restricted-imports` in `eslint.config.mjs`. Each domain can only import from:
- Its own files
- `lib/` (pure utilities — no restrictions)
- `gateway/` (bus interface + decorators + protocol)
- **Exception:** `services/fs`, `services/web` are utilities and have no restrictions

Specific restrictions:
- `services/agent-v2/` cannot import from channels, cron, memory, or edge adapters
- `services/channels/`, `services/cron/`, `services/memory/`, `services/tools/` cannot import from each other (communicate via RPC only)
- `edge/` adapters cannot import from each other
- `lib/` cannot import from any service or edge module

Cross-domain communication must go through bus RPC (`bus.call` or `@register` decorated methods).

### Cross-Service Dependency Pattern: Type Imports Only

**Universal rule:** All services follow the same zero-runtime-dependency pattern. Services may import **type-only** definitions from `services/config/` to type-check the `AppConfig` object passed at boot time. All other inter-service communication goes through `bus.call()` or event subscriptions (`@on`).

**What this means:**
- `import type { AppConfig, CronTask, ChannelEntry }` — ✅ **allowed** (compile-time only)
- `import { getConfig }` or any function from another service — ❌ **forbidden** (creates runtime coupling)
- `bus.call('channel.send', ...)` — ✅ **required** for inter-service calls

**Current state:** All services (agent-v2, channels, cron, memory, log, fs, web) comply. Type imports from config are strictly `import type` syntax.

**Why this pattern:**
1. **Zero runtime overhead** — Type imports are erased during transpilation; they don't load or execute code
2. **Config is a singleton** — Passed via constructor at boot, not fetched dynamically at runtime
3. **Avoids three problematic alternatives:**
   - **Bloating `gateway/events.ts`** — EventMap tracks *event contracts*, not *config schemas*; mixing creates confusion and artifact bloat
   - **Creating a separate `@vargos/types` package** — adds a dependency, slows iteration on schema changes, breaks monorepo simplicity
   - **Duplicating types across services** — creates maintenance burden, version skew, and single-source-of-truth violations

**Enforcement:** ESLint rules in `eslint.config.mjs` block runtime imports between services. If adding a service, ensure it follows this pattern: receive config via constructor, communicate via bus RPC.

**Future considerations:** If migrating to polyglot service architecture (different languages), move shared types to `gateway/types.ts` — but for a monorepo, the current design is optimal.

## Config Normalization

`config.json` supports a v1 format with automatic normalization at load time (`normalizeConfigInput` in `services/config/index.ts`):

- **Models**: `Record<name, profile>` (object map) → `Array<profile & { name }>` (array)
- **Agent**: `agent.primary` → `agent.model` (fallback kept as `agent.fallback`)
- **Heartbeat**: `every: "*/30 * * * *"` → `intervalMinutes: 30`; `activeHours: { start, end, timezone }` → `activeHours: [startHour, endHour]` + `activeHoursTimezone`

Model profiles support `contextWindow` and `maxTokens` which are forwarded to the Pi SDK. `AppConfigSchema` uses `.passthrough()` at the top level to tolerate unknown fields during migration.

## Data Paths

- Config: `~/.vargos/config.json` (or `$VARGOS_DATA_DIR`)
- Workspace/bootstrap: `~/.vargos/workspace/`
- Sessions: `~/.vargos/sessions/`
- Cache/SQLite: `~/.cache/vargos/`
