# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

Vargos is an MCP server with an embedded Pi agent runtime. It exposes 15 tools for AI agents and routes messages from multiple channels (WhatsApp, Telegram) through a plugin-based gateway.

**Entry points:**
- `src/index.ts` — MCP server (stdio + HTTP)
- `src/cli.ts` — Interactive chat and task runner (commander)
- `src/boot.ts` — Shared init sequence used by both

## Repository Structure

```
src/
├── index.ts                # MCP server entry (stdio + HTTP transport)
├── cli.ts                  # CLI: chat, run, config, onboard, scheduler
├── boot.ts                 # Shared boot: config → workspace → tools → services → runtime
│
├── agent/                  # Agent runtime + orchestration
│   ├── runtime.ts          # PiAgentRuntime — wraps Pi SDK, message queueing
│   ├── extension.ts        # Converts Vargos tools → Pi SDK tool format
│   ├── lifecycle.ts        # EventEmitter for streaming run events
│   ├── prompt.ts           # System prompt builder (full/minimal/none modes)
│   ├── queue.ts            # Per-session message queue (serialized execution)
│   ├── history.ts          # Session history helpers
│   ├── session-init.ts     # Pi session file initialization
│   └── subagent-registry.ts # Subagent tracking
│
├── tools/                  # 15 MCP tool implementations
│   ├── registry.ts         # ToolRegistry singleton (lazy-loaded)
│   ├── types.ts            # Tool, ToolContext, ToolResult interfaces
│   ├── base.ts             # BaseTool abstract class
│   ├── index.ts            # Re-exports + initializeToolRegistry()
│   ├── read.ts             # Read files (5MB limit, image support)
│   ├── write.ts            # Write/create files (append mode)
│   ├── edit.ts             # Precise text replacement
│   ├── exec.ts             # Shell commands (60s timeout, 100KB output)
│   ├── process.ts          # Background process management
│   ├── web-fetch.ts        # Fetch + extract readable content
│   ├── browser.ts          # Playwright browser automation
│   ├── memory-search.ts    # Hybrid semantic + text search
│   ├── memory-get.ts       # Read specific memory files
│   ├── sessions-list.ts    # List sessions
│   ├── sessions-history.ts # Session transcript
│   ├── sessions-send.ts    # Send message to session
│   ├── sessions-spawn.ts   # Spawn Pi-powered subagent
│   ├── cron-add.ts         # Add scheduled task
│   └── cron-list.ts        # List cron jobs
│
├── gateway/                # Message gateway (channel → agent)
│   ├── core.ts             # Gateway + PluginRegistry
│   ├── types.ts            # InputType, NormalizedInput, InputPlugin
│   ├── index.ts            # Re-exports
│   └── plugins/
│       ├── text.ts         # Text input handler
│       ├── image.ts        # Image input (base64 encoding)
│       └── media.ts        # Voice, file, video input
│
├── channels/               # External messaging adapters
│   ├── types.ts            # ChannelAdapter interface, ChannelConfig
│   ├── factory.ts          # Creates WhatsApp/Telegram adapters from config
│   ├── registry.ts         # Active adapter registry
│   ├── config.ts           # ~/.vargos/channels.json management
│   ├── onboard.ts          # Channel setup wizard (@clack/prompts)
│   ├── reconnect.ts        # Exponential backoff reconnection
│   ├── whatsapp/
│   │   ├── adapter.ts      # Baileys WebSocket, QR auth, message routing
│   │   └── session.ts      # Inbound message processing + media download
│   └── telegram/
│       ├── adapter.ts      # Long-polling, whitelist, bot token auth
│       └── types.ts        # Telegram API types
│
├── config/                 # Configuration
│   ├── paths.ts            # Centralized path resolution (~/.vargos/*)
│   ├── validate.ts         # checkConfig() — env var validation
│   ├── onboard.ts          # Interactive config wizard (provider, model, API key)
│   ├── banner.ts           # Startup banner display
│   ├── identity.ts         # First-run USER.md/SOUL.md setup
│   ├── workspace.ts        # Workspace dir init + context file loading
│   └── pi-config.ts        # Pi SDK settings + auth storage
│
├── services/               # Service layer (swappable backends)
│   ├── factory.ts          # ServiceFactory singleton, getServices(), getMemoryContext()
│   ├── types.ts            # IMemoryService, ISessionService, IVectorService
│   ├── browser.ts          # Playwright browser automation
│   ├── process.ts          # Background process management
│   ├── memory/
│   │   ├── context.ts      # MemoryContext — hybrid search, auto-indexing, citations
│   │   ├── file.ts         # File-based memory (markdown, text search)
│   │   ├── qdrant.ts       # Qdrant vector search
│   │   └── sqlite-storage.ts # SQLite embeddings cache
│   └── sessions/
│       ├── file.ts         # JSONL session storage
│       └── postgres.ts     # PostgreSQL session storage
│
├── cron/                   # Scheduled tasks
│   ├── scheduler.ts        # CronScheduler singleton, spawns subagents
│   ├── heartbeat.ts        # HEARTBEAT.md poller (30m interval)
│   ├── index.ts            # Re-exports
│   └── tasks/              # Task definitions
│
└── lib/                    # Shared utilities
    ├── errors.ts           # formatErrorResult(), subagent tool restrictions
    ├── mime.ts             # MIME detection from buffer signatures
    ├── path.ts             # expandTilde()
    ├── media.ts            # Media file persistence
    ├── dedupe.ts           # In-memory dedup cache (TTL-based)
    ├── debounce.ts         # Message debouncer (batches rapid messages)
    └── reply-delivery.ts   # Channel reply delivery + message splitting
```

## Module Responsibilities

### Boot Sequence (`boot.ts`)

```
boot()
  ├── checkConfig()           validate env vars (interactive if TTY)
  ├── initializeWorkspace()   create dirs, scaffold context files
  ├── checkIdentitySetup()    prompt for USER.md/SOUL.md (TTY only)
  ├── initializeToolRegistry()  lazy-load all 15 tools
  ├── initializeServices()    memory + session backends
  └── initializePiAgentRuntime()

startBackgroundServices()
  ├── CronScheduler.startAll()
  ├── startHeartbeat()        poll HEARTBEAT.md every 30m
  └── Channel adapters        load configs → create → initialize → start
```

### MCP Server (`index.ts`)

Exposes tools to external MCP clients (Claude Desktop, Cursor, etc.) via stdio or HTTP.

```
MCP Client (Claude Desktop)
    │
    ▼
┌──────────────────────────────────┐
│  MCP Server (index.ts)           │
│  ┌────────────────────────────┐  │
│  │ ListToolsRequest           │  │  → toolRegistry.list()
│  │ CallToolRequest            │  │  → tool.execute(args, context)
│  └────────────────────────────┘  │
│  Transport: stdio | HTTP         │
│  Subagent restrictions enforced  │
│  PID lock (one instance only)    │
└──────────────────────────────────┘
```

### Channel → Gateway → Agent Flow

Messages from WhatsApp/Telegram flow through the gateway to the agent runtime.

```
WhatsApp DM / Telegram msg
    │
    ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Channel     │────▶│  Gateway     │────▶│  Agent Runtime   │
│  Adapter     │     │  core.ts     │     │  (Pi SDK)        │
│              │     │              │     │                   │
│  dedupe      │     │  plugin      │     │  system prompt    │
│  debounce    │     │  routing     │     │  tool execution   │
│  reconnect   │     │  session mgmt│     │  response extract │
└─────────────┘     └──────────────┘     └─────────────────┘
    ▲                                            │
    │           reply via adapter.send()         │
    └────────────────────────────────────────────┘

Detailed flow:
1. Adapter receives message → dedup check → debounce batch
2. Gateway.processAndDeliver() called
3. Plugin selected by input type (text/image/voice/file)
4. Plugin prepares input (extract text, encode images, save media)
5. Message stored in session (role: user)
6. PiAgentRuntime.run() executes with full tool access
7. Agent response stored in session
8. Reply delivered back to channel adapter
```

### Agent Runtime (`agent/runtime.ts`)

Wraps `@mariozechner/pi-coding-agent` to provide a unified agent for both CLI and gateway.

```
PiAgentRuntime.run(config)
    │
    ├── SessionMessageQueue      serialize per-session (one run at a time)
    ├── Pi SessionManager        open session file, auth, model registry
    ├── createVargosCustomTools() wrap 15 MCP tools as Pi SDK tools
    ├── buildSystemPrompt()      context injection (first message only)
    │     ├── identity, tooling, workspace
    │     ├── context files (AGENTS.md, SOUL.md, etc.)
    │     └── channel context (if from messaging)
    ├── session.prompt(task)     execute via Pi SDK
    │     └── tool calls → Vargos tools → results back to Pi
    └── extract response from session history
```

### Subagent Spawning

```
Parent session
    │
    ▼
sessions_spawn tool called
    │
    ├── Create child session (parent:subagent:child-id)
    ├── Minimal prompt (AGENTS.md + TOOLS.md only)
    ├── Restricted tools (no session tools, no spawning)
    └── On completion → announce result to parent session
```

### Tool Architecture

Tools are shared between MCP server (direct) and agent runtime (via Pi SDK wrapper).

```
                    ┌─────────────────────┐
                    │  ToolRegistry       │
                    │  (15 tools)         │
                    └────────┬────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         MCP Server    Pi SDK Agent    Cron Scheduler
         (direct)      (extension.ts)  (subagent)
```

## Development Commands

```bash
pnpm install              # Install deps
pnpm dev                  # Start MCP server (stdio)
pnpm chat                 # Interactive CLI chat
pnpm test                 # Tests (watch mode)
pnpm run test:run         # Tests (CI, run once)
pnpm lint                 # ESLint + typecheck
pnpm run typecheck        # TypeScript only
```

CLI subcommands (via `tsx src/cli.ts`):
```bash
pnpm chat                          # Interactive chat (default session)
tsx src/cli.ts chat -s myproject   # Named session
tsx src/cli.ts run "Analyze X"     # One-shot task
tsx src/cli.ts config              # Interactive config wizard
tsx src/cli.ts onboard             # Channel setup (WhatsApp/Telegram)
tsx src/cli.ts scheduler           # Standalone cron
```

## Coding Conventions

### Imports
- ESM with `.js` extensions on all internal imports
- External packages first, then internal

```typescript
import { z } from 'zod';
import { promises as fs } from 'node:fs';

import { getServices } from '../services/factory.js';
import type { IMemoryService } from '../services/types.js';
```

### Patterns
- **Singleton**: `getX()` lazy getter + `initializeX()` for explicit creation
- **File naming**: kebab-case (`memory-search.ts`), PascalCase classes (`MemoryContext`)
- **Tool implementation**: Zod schema → execute(args, context) → ToolResult

### Adding a New Tool

1. Create `tools/<name>.ts` with Tool interface
2. Register in `tools/index.ts` via `initializeToolRegistry()`
3. Add tests in `tools/<name>.test.ts`

```typescript
// tools/example.ts
import { z } from 'zod';
import type { Tool } from './types.js';

export const ExampleTool: Tool = {
  name: 'example',
  description: 'Does something',
  parameters: z.object({ input: z.string() }),
  async execute(args, context) {
    return { content: [{ type: 'text', text: 'result' }] };
  },
};
```

### Adding a Backend

1. Implement interface from `services/types.ts`
2. Add to `services/<type>/<name>.ts`
3. Register in `services/factory.ts`

## Path Resolution

All paths centralized in `config/paths.ts`:

```typescript
resolveDataDir()            // VARGOS_DATA_DIR || ~/.vargos
resolveWorkspaceDir()       // VARGOS_WORKSPACE || $DATA_DIR/workspace
resolveSessionsDir()        // $DATA_DIR/sessions
resolveSessionFile(key)     // $DATA_DIR/sessions/<key>.jsonl
resolveChannelsDir()        // $DATA_DIR/channels
resolveChannelConfigFile()  // $DATA_DIR/channels.json
```

## Environment Variables

```bash
VARGOS_DATA_DIR=~/.vargos           # Root data directory
VARGOS_WORKSPACE=$DATA_DIR/workspace # Context files
VARGOS_MEMORY_BACKEND=file          # file | qdrant
VARGOS_SESSIONS_BACKEND=file        # file | postgres
VARGOS_TRANSPORT=stdio              # stdio | http
VARGOS_HOST=127.0.0.1              # HTTP transport only
VARGOS_PORT=3000                    # HTTP transport only
VARGOS_ENDPOINT=/mcp               # HTTP transport only
OPENAI_API_KEY=sk-...              # For embeddings + Pi runtime
QDRANT_URL=http://localhost:6333   # Qdrant vector search
POSTGRES_URL=postgresql://...      # PostgreSQL sessions
```

## Data Directory

```
~/.vargos/
├── workspace/           # Context files
│   ├── AGENTS.md        # Agent behavior rules
│   ├── SOUL.md          # Agent personality
│   ├── USER.md          # User info (name, timezone)
│   ├── TOOLS.md         # Tool usage guidance
│   ├── MEMORY.md        # Persistent memory notes
│   ├── HEARTBEAT.md     # Periodic task list
│   └── memory/          # Daily notes (YYYY-MM-DD.md)
├── agent/               # Pi SDK config + auth
├── channels.json        # Channel adapter configs
├── channels/
│   └── whatsapp/        # Baileys auth state
├── sessions/            # Session JSONL transcripts
├── memory.db            # SQLite embeddings cache
└── vargos.pid           # Process lock file
```

## What's Supported

| Feature | Status | Notes |
|---------|--------|-------|
| MCP stdio transport | Working | Default, for Claude Desktop |
| MCP HTTP transport | Working | Set `VARGOS_TRANSPORT=http` |
| WhatsApp channel | Working | Baileys, linked devices QR auth |
| Telegram channel | Working | Bot token, long-polling |
| File memory backend | Working | Zero deps, text search |
| Qdrant memory backend | Working | Vector semantic search |
| File session backend | Working | JSONL files |
| PostgreSQL sessions | Working | ACID, indexable |
| Subagent spawning | Working | Isolated sessions, restricted tools |
| Cron scheduling | Working | Agent-executed tasks |
| Heartbeat polling | Working | 30m interval, HEARTBEAT.md |
| Browser automation | Working | Requires Playwright installed |
| Hybrid memory search | Working | Vector + text weighted scoring |

## Important Notes

- **Less code is better** — remove unused code, don't extend
- **No business logic in tools** — delegate to services
- **Use MemoryContext for search** — not raw memory service
- **Tools are shared** — same 15 tools serve MCP clients and Pi agent
- **One instance only** — PID lock prevents duplicate processes
