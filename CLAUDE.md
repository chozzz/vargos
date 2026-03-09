# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vargos is a TypeScript/Node.js MCP runtime for agents. It runs as a local WebSocket gateway service that exposes tools via the Model Context Protocol (MCP) and routes agent conversations through messaging channels (WhatsApp, Telegram).

See [FEATURES.md](./FEATURES.md) for a full feature inventory and status.

## Commands

```bash
# Package manager: pnpm
pnpm install                # install deps (postinstall rebuilds better-sqlite3)

# Run
pnpm start                  # start gateway + all services (tsx src/cli/index.ts gateway start)
pnpm cli                    # interactive CLI menu
pnpm chat                   # start a chat session
pnpm cli run "task"         # run a one-shot task

# Build & check
pnpm build                  # tsc
pnpm run typecheck          # tsc --noEmit

# Test (vitest, co-located *.test.ts files)
pnpm test                   # watch mode
pnpm run test:run           # single run
# Run a single test file:
npx vitest run src/agent/queue.test.ts

# Lint
pnpm lint                   # eslint + typecheck
```

## Architecture

### Service-Oriented Gateway

Every component is an isolated **service** that connects to a central WebSocket gateway (`src/gateway/server.ts`, default port 9000). Services communicate exclusively through typed RPC requests and pub/sub events — no shared state or cross-domain imports.

Wire protocol (`src/protocol/index.ts`) defines three frame types validated with Zod:
- `RequestFrame` — RPC call to a target service
- `ResponseFrame` — RPC response
- `EventFrame` — pub/sub broadcast

All services extend `ServiceClient` (`src/gateway/service-client.ts`), which handles WebSocket connection, RPC calls (`call(target, method, params)`), event emission, and auto-reconnect.

### Services

| Service | Directory | Key Methods | Events |
|---------|-----------|-------------|--------|
| **agent** | `src/agent/` | `agent.run`, `agent.abort` | `run.started`, `run.delta`, `run.completed` |
| **tools** | `src/tools/` | `tool.execute`, `tool.list` | — |
| **sessions** | `src/sessions/` | `session.list`, `session.get`, `session.create`, `session.addMessage` | `session.created`, `session.message` |
| **channels** | `src/channels/` | `channel.send`, `channel.sendMedia`, `channel.list` | `message.received`, `channel.connected` |
| **cron** | `src/cron/` | `cron.list`, `cron.add`, `cron.remove` | `cron.trigger` |
| **mcp** | `src/mcp/` | MCP bridge (HTTP on port 9001 + stdio, bearer auth) | — |

### Boot Sequence (`src/cli/gateway/start.ts`)

GatewayServer → SessionsService → SessionReaper → MemoryContext → ToolsService → CronService → AgentService → ChannelService → McpBridge

### Agent Runtime

`PiAgentRuntime` (`src/agent/runtime.ts`) wraps `@mariozechner/pi-coding-agent`. `SessionMessageQueue` serializes runs per session to prevent race conditions. System prompt is assembled from workspace bootstrap files (`~/.vargos/workspace/*.md`). Tools are wrapped into Pi SDK format via `src/agent/extension.ts`.

**History injection pipeline** (`src/agent/history.ts`):
1. Convert session messages → agent messages (inject `subagent_announce` as user messages)
2. Sanitize: repair tool result pairing, merge consecutive same-role messages
3. Truncate oversized tool results (>30% of context window) with head+tail strategy
4. Token-budget prune: drop oldest messages to fit 50% of context window
5. Turn-limit fallback: hard ceiling (30 for channels, 10 for cron, 50 for CLI)
6. Prepend preamble when messages are dropped so agent knows context was lost

**In-run compaction** (Pi SDK extensions in `src/agent/extensions/`):
- `context-pruning.ts` — soft-trims old tool results before each LLM call (head+tail at 30% ratio, hard-clear at 50%)
- `compaction-safeguard.ts` — multi-stage hierarchical summarization when SDK triggers auto-compact

**Empty response retry**: cron/webhook runs retry once if the model returns a thinking-only response with no visible output.

### Sub-agent Orchestration

Parent agents delegate subtasks via `sessions_spawn` tool → child sessions run independently → results announced back via `subagent_announce` system messages → parent re-triggered (debounced 3s) to synthesize. Configurable limits in `config.agent.subagents`: `maxChildren` (default 10), `maxSpawnDepth` (default 3), `runTimeoutSeconds` (default 300). Sub-agents get `minimal-subagent` prompt mode (no memory, heartbeats, or codebase context).

**Cron/webhook subagent delivery**: when a cron or webhook session spawns subagents, re-trigger results are routed to `notify` targets stored in session metadata (not to the cron channel, which has no adapter).

### Tool System

Tools are organized in extension groups under `src/tools/` (fs, web, agent, memory). Each tool implements:
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
Extensions register tools via `VargosExtension.register(ctx)` → `ctx.registerTool()` into the singleton `ToolRegistry`.

### Channels (`src/channels/`)

Adapters implement `ChannelAdapter` (`src/channels/types.ts`). Base class (`src/channels/base-adapter.ts`) provides shared logic.

**Chat directives** (`src/lib/directives.ts`): Users can prefix messages with `/think:<level>` (off/low/medium/high) or `/verbose` to override per-message inference settings. Directives are parsed and stripped in `AgentService` before the task reaches the agent — the agent never sees the raw directive tokens.

**Message debouncing**: `BaseChannelAdapter` uses `createMessageDebouncer` (`src/lib/debounce.ts`) to batch rapid messages from the same sender before triggering an agent run. Default delay is 2000ms; configurable per channel via `debounceMs` in `config.json`. Media messages (photo, audio, video) bypass the debouncer and flush any pending text immediately so they are processed in order.

**Typing indicators**: circuit breaker stops after 3 consecutive failures; TTL safety auto-stops after 120s to prevent zombie indicators.

**Status reactions** (`src/channels/status-reactions.ts`): `StatusReactionController` drives emoji reactions on the triggering message through agent phases: queued (👀) → thinking (🤔) → tool (🔧) → done (👍) / error (❗). Transient phases are debounced (500ms), terminal phases are immediate and seal the controller. Requires `react()` method on the adapter (implemented on WhatsApp via Baileys, Telegram via `setMessageReaction`).

**Link understanding** (`src/channels/link-expand.ts`): URLs in inbound channel messages are auto-expanded — fetched and appended as readable text under a `---\n[Expanded links]` separator. Configurable via `config.linkExpand`: `enabled`, `maxUrls` (default 3), `maxCharsPerUrl` (default 8000), `timeoutMs` (default 5000). Private/internal IPs are filtered out. Expansion failures are silently ignored.

**Media delivery**: Two mechanisms — `channel_send_media` tool (explicit, agent-initiated) and `extractMediaPaths` (passive regex fallback that scans `channel.send` text for file paths). The explicit tool is preferred; the passive path exists as a safety net.

**Event subscriptions**: channel service subscribes to `run.started` (start typing + init reactions), `run.delta` (track tool phases for reactions), `run.completed` (stop typing + seal reactions).

### Cron Notifications

Cron tasks support an optional `notify` array of channel targets (e.g. `["whatsapp:61423222658"]`). After a run completes, results are delivered to each target and stored as assistant messages in the target session for conversation continuity.

### Session Storage

JSONL files under `~/.vargos/sessions/`. First line is metadata, subsequent lines are messages. Session keys (e.g. `whatsapp:+61...`) map to nested directory paths.

**Session reaper** (`src/sessions/reaper.ts`): deterministic TTL-based cleanup runs at boot + every 6 hours. Deletes cron sessions >7 days and subagent sessions >3 days. Never touches `main` sessions (long-lived user/channel sessions).

### Memory System (`src/memory/`)

Hybrid semantic + text search over `~/.vargos/workspace/*.md`. Chunks text, supports OpenAI embeddings (fallback: trigram-hash vectors) + BM25 scoring. Backends: SQLite (`better-sqlite3`) or PostgreSQL (pgvector).

### CLI

Command tree is data-driven in `src/cli/tree.ts` — a `MenuNode[]` array that drives both the interactive menu and CLI argument routing.

### Error Handling & Retry

**Structured retry** (`src/lib/retry.ts`): `withRetry(fn, config)` wraps any async operation with exponential backoff and optional jitter. Config: `maxRetries` (default 3), `baseMs` (default 1000), `maxMs` (default 30_000), `jitter` (default true), `shouldRetry` predicate, `signal` for abort. The gateway auto-reconnect and other transient-failure paths use this utility.

**Retryable error detection** (`src/agent/runtime.ts`): `isRetryableError()` identifies network errors, JSON parse failures, HTTP 502/503/529, and abort signals as safe to retry within an agent run.

### Path Boundary Validation

`validateBoundary()` (`src/lib/path.ts`) prevents path traversal in fs tools (read, write, edit). All file paths are resolved through `fs.realpath` (symlink-aware), then checked against the workspace boundary. An optional allowlist permits access to paths outside the boundary (e.g. shared model directories). New files that don't exist yet are resolved by walking up to the nearest existing ancestor. The boundary and allowlist are injected via `ToolContext.boundary` — both by the agent runtime (`extension.ts`) and by `ToolsService` for gateway RPC callers (MCP bridge, etc.).

## Domain Boundary Rules

ESLint enforces strict domain isolation via `no-restricted-imports`. Each domain directory can only import from:
- Its own files
- `src/lib/` (pure utilities)
- `src/protocol/` (wire protocol types)
- `src/config/` (configuration)
- `src/gateway/` (service client base)
- **Exception:** `src/tools/` may also import `src/services/`

`src/lib/` cannot import from any domain module. Cross-domain communication must go through gateway RPC.

## Data Paths

- Config: `~/.vargos/config.json` (or `$VARGOS_DATA_DIR`)
- Workspace/bootstrap: `~/.vargos/workspace/`
- Sessions: `~/.vargos/sessions/`
- Cache/SQLite: `~/.cache/vargos/`
