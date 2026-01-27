# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vargos is an MCP (Model Context Protocol) server that exposes 15 tools for AI agents to interact with real-world systems:
- **File tools**: read, write, edit
- **Shell tools**: exec, process
- **Web tools**: web_fetch, browser
- **Memory tools**: memory_search, memory_get
- **Session tools**: sessions_list, sessions_history, sessions_send, sessions_spawn
- **Cron tools**: cron_add, cron_list

**Core Philosophy:** Providing Agents to your Machine - giving AI agents practical capabilities to execute system actions.

**Key Components:**
- **MCP Server** (`index.ts`) - Stdio server for Claude Desktop, etc.
- **Pi Agent Runtime** (`pi/runtime.ts`) - Unified agent runtime for CLI + MCP
- **CLI** (`cli.ts`) - Interactive chat and task runner

## Repository Structure

This is a **single-package TypeScript project** (not a monorepo):

```
vargos/
├── src/
│   ├── agent/              # Agent lifecycle + orchestration
│   │   ├── lifecycle.ts    # Agent lifecycle events (streaming)
│   │   ├── prompt.ts       # System prompt builder
│   │   └── queue.ts        # Per-session message queue
│   │
│   ├── config/             # Configuration management
│   │   ├── paths.ts        # Centralized path resolution (data dir, workspace, sessions)
│   │   ├── identity.ts     # First-run identity setup (USER.md/SOUL.md prompts)
│   │   ├── interactive.ts  # Interactive config prompts
│   │   ├── workspace.ts    # Workspace initialization
│   │   └── pi-config.ts    # Pi SDK settings
│   │
│   ├── core/               # Core interfaces and base classes
│   │   ├── services/
│   │   │   └── types.ts    # Service interfaces (IMemoryService, ISessionService)
│   │   └── tools/
│   │       ├── types.ts    # Tool interfaces
│   │       └── base.ts     # BaseTool class
│   │
│   ├── cron/               # Scheduled task runner
│   │   ├── scheduler.ts    # Cron scheduler (auto-starts with server)
│   │   ├── heartbeat.ts    # Periodic HEARTBEAT.md runner
│   │   └── tasks/          # Task definitions
│   │
│   ├── gateway/            # Message gateway
│   │   ├── core.ts         # Gateway core
│   │   ├── transports.ts   # Transport layer
│   │   └── plugins/        # Gateway plugins (text, etc.)
│   │
│   ├── lib/                # Shared utilities
│   │   ├── mime.ts         # MIME type helpers
│   │   └── path.ts         # Path utilities
│   │
│   ├── mcp/tools/          # MCP tool implementations (15 tools)
│   │   ├── registry.ts     # Tool registration
│   │   ├── types.ts        # Tool types
│   │   ├── read.ts, write.ts, edit.ts
│   │   ├── exec.ts, process.ts
│   │   ├── web-fetch.ts, browser.ts
│   │   ├── memory-search.ts, memory-get.ts
│   │   ├── sessions-list.ts, sessions-history.ts
│   │   ├── sessions-send.ts, sessions-spawn.ts
│   │   └── cron-add.ts, cron-list.ts
│   │
│   ├── pi/                 # Pi Agent Runtime
│   │   ├── runtime.ts      # Unified agent runtime
│   │   └── extension.ts    # Pi SDK tool integration
│   │
│   ├── services/           # Service implementations
│   │   ├── factory.ts      # ServiceFactory + global initialization
│   │   ├── memory/
│   │   │   ├── context.ts  # MemoryContext (hybrid search)
│   │   │   ├── sqlite-storage.ts  # SQLite persistence
│   │   │   ├── file.ts     # File-based memory
│   │   │   └── qdrant.ts   # Qdrant vector search
│   │   ├── sessions/
│   │   │   ├── file.ts     # JSONL session storage
│   │   │   └── postgres.ts # PostgreSQL sessions
│   │   ├── browser.ts      # Browser automation service
│   │   └── process.ts      # Process management service
│   │
│   ├── utils/
│   │   └── errors.ts       # Error handling utilities
│   │
│   ├── cli.ts              # Interactive CLI entry point
│   └── index.ts            # MCP server entry point
│
├── README.md
├── CLAUDE.md
├── CONTRIBUTING.md
├── package.json
└── vitest.config.ts
```

**Node.js Requirement:** 20+

## Development Commands

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test              # Watch mode
pnpm run test:run      # Run once (CI)

# Run development server
pnpm dev

# Lint
pnpm lint
```

## Architecture

### 4-Layer Architecture

1. **MCP Tools** (`mcp/tools/*.ts`)
   - 15 tool implementations
   - Validate input with Zod schemas
   - Call services via `getServices()` or `getMemoryContext()`

2. **Service Interfaces** (`core/services/types.ts`)
   - `IMemoryService` - Memory storage (file, Qdrant)
   - `ISessionService` - Session storage (file, Postgres)
   - `IVectorService` - Vector operations

3. **Service Implementations** (`services/`)
   - Swappable backends
   - MemoryContext for hybrid search

4. **Infrastructure** (SQLite, file system, Qdrant client, Postgres)

### Service Factory Pattern

```typescript
// services/factory.ts
export class ServiceFactory {
  createMemoryService(): IMemoryService { /* ... */ }
  createSessionService(): ISessionService { /* ... */ }
  async createMemoryContext(): Promise<MemoryContext> { /* ... */ }
}

// Global initialization
export async function initializeServices(config): Promise<void> {
  const factory = new ServiceFactory(config);
  globalServices = {
    memory: factory.createMemoryService(),
    sessions: factory.createSessionService(),
    memoryContext: await factory.createMemoryContext(),
  };
}

// Tool usage
export function getMemoryContext(): MemoryContext {
  return getServices().memoryContext;
}
```

### Path Resolution

All data paths are centralized in `config/paths.ts`:

```typescript
resolveDataDir()            // VARGOS_DATA_DIR || ~/.vargos
resolveWorkspaceDir()       // VARGOS_WORKSPACE || $DATA_DIR/workspace
resolveSessionsDir()        // $DATA_DIR/sessions
resolveSessionFile(key)     // $DATA_DIR/sessions/<key>.jsonl
resolveChannelsDir()        // $DATA_DIR/channels
resolveChannelConfigFile()  // $DATA_DIR/channels.json
```

## Pi Agent Runtime

The Pi Agent Runtime provides a unified agent implementation for both CLI and MCP server modes.

**Location:** `src/pi/runtime.ts`

**Features:**
- Exposes all registered MCP tools to the Pi SDK
- Persistent sessions with JSONL transcript storage
- Auto-loads context files from workspace directory
- Console logging of tool calls and results

**Usage:**
```typescript
import { PiAgentRuntime } from './pi/runtime.js';

const runtime = new PiAgentRuntime();
const result = await runtime.run({
  sessionKey: 'cli:main',
  sessionFile: '/path/to/session.jsonl',
  workspaceDir: process.cwd(),
  model: 'gpt-4o-mini',
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
});
```

## MemoryContext

Memory system with hybrid search:

**Features:**
- Hybrid search (vector + text) with configurable weights
- Automatic chunking with overlap
- SQLite persistence for embeddings
- Session transcript indexing
- File watcher for auto-reindex
- Citations (file + line range)

**Usage:**
```typescript
import { getMemoryContext } from '../services/factory.js';

const memory = getMemoryContext();
const results = await memory.search('option A', { maxResults: 5 });
// Returns: [{ chunk, score, citation: 'memory/2026-02-06.md#L10-L25' }]
```

## Coding Conventions

### File Naming
- **kebab-case** for files: `memory-search.ts`, `sqlite-storage.ts`
- **PascalCase** for classes: `MemoryContext`, `FileMemoryService`

### Import Organization
- External packages first, then internal modules
- Internal imports use `.js` extension (ESM)

```typescript
// External
import { z } from 'zod';
import { promises as fs } from 'node:fs';

// Internal
import { getServices } from '../services/factory.js';
import type { IMemoryService } from '../core/services/types.js';
```

## MCP Tool Implementation

When implementing MCP tools:

1. **File naming:** `*.ts` in `mcp/tools/`
2. **Export pattern:** Named export with tool definition
3. **Input validation:** Use Zod schemas
4. **Service access:** Use `getServices()` or `getMemoryContext()`

Example:
```typescript
// mcp/tools/read.ts
import { z } from 'zod';
import { getServices } from '../../services/factory.js';

export const ReadTool = {
  name: 'read',
  description: 'Read a file',
  parameters: z.object({
    path: z.string(),
    offset: z.number().optional(),
    limit: z.number().optional(),
  }),
  async execute(args) {
    const services = getServices();
    const content = await services.memory.read(args.path, {
      offset: args.offset,
      limit: args.limit,
    });
    return { content };
  },
};
```

## Testing

All tools have corresponding test files:

```typescript
// mcp/tools/read.test.ts
import { describe, it, expect } from 'vitest';
import { ReadTool } from './read.js';

describe('read tool', () => {
  it('should read a file', async () => {
    const result = await ReadTool.execute({ path: 'test.md' });
    expect(result.content).toBeDefined();
  });
});
```

## Environment Configuration

```bash
# Data directory (default: ~/.vargos)
VARGOS_DATA_DIR=~/.vargos

# Memory backend: file | qdrant
VARGOS_MEMORY_BACKEND=file

# Sessions backend: file | postgres
VARGOS_SESSIONS_BACKEND=file

# Qdrant config
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=optional

# PostgreSQL config
POSTGRES_URL=postgresql://localhost:5432/vargos

# OpenAI (for embeddings in MemoryContext)
OPENAI_API_KEY=sk-...
```

## Data Directory Structure

Vargos stores persistent data in `~/.vargos/`:

```
~/.vargos/
├── workspace/              # Context files (AGENTS.md, SOUL.md, etc.)
│   ├── AGENTS.md
│   ├── SOUL.md
│   ├── USER.md
│   ├── TOOLS.md
│   ├── HEARTBEAT.md
│   └── memory/             # Daily notes
├── agent/                  # Pi SDK configuration
├── channels.json           # Channel adapter configs
├── channels/
│   └── whatsapp/           # Baileys auth state
├── sessions/               # Session JSONL files
│   ├── cli-main.jsonl
│   └── cli-myproject.jsonl
└── memory.db               # SQLite embeddings cache
```

**Directory purposes:**
- **Working directory** (`process.cwd()`): Where tools (`read`, `exec`, `write`) operate on files
- **Context directory** (`~/.vargos/workspace/`): Where agent personality/context files live
- **Data directory** (`~/.vargos/`): Where sessions and embeddings are persisted

## Swappable Backends

Tools don't know about backends — they use interfaces:

```typescript
// Use getMemoryContext() for search (not raw services)
const memory = getMemoryContext();
const results = await memory.search(query);
```

To add a new backend:
1. Create implementation in `services/<type>/<name>.ts`
2. Implement interface from `core/services/types.ts`
3. Register in `services/factory.ts`
4. Add tests

## Important Notes

- **Less code is better** - Remove unused or deprecated code
- **Test coverage** - All tools should have tests
- **No business logic in tools** - Delegate to services
- **Use MemoryContext for search** - Not raw memory service
- **File watcher** - Enabled in dev mode (`NODE_ENV=development`)
- **Session indexing** - Configure `sessionsDir` to index transcripts
