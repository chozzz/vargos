# Vargos

**Vargos** is an MCP (Model Context Protocol) server that gives AI agents practical tools to interact with real-world systems.

> Built for extensibility, modularity, and self-hosting from the ground up.

## Overview

Vargos exposes 12 MCP tools that enable AI agents to:
- Read, write, and edit files
- Execute shell commands and manage processes
- Search memory with hybrid semantic + text search
- Manage browser automation
- List and interact with sessions

**Key Features:**
- 🔧 **12 MCP Tools** - File, shell, web, memory, and session tools
- 🔄 **Swappable Backends** - File, Qdrant, or PostgreSQL for memory/sessions
- 🧠 **OpenClaw-style Memory** - Hybrid search with chunking and citations
- 💾 **SQLite Persistence** - Embeddings cached for fast restarts
- 📁 **Session Indexing** - Search across conversation history
- 👁️ **File Watcher** - Auto-reindex when memory files change
- ✅ **56 Tests** - Full test coverage with Vitest

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm (or npm)

### Installation

```bash
git clone https://github.com/chozzz/vargos.git
cd vargos
pnpm install
```

### Development

```bash
# Run tests
pnpm test

# Run with file backend (default)
pnpm dev

# Run with Qdrant + Postgres backends
QDRANT_URL=http://localhost:6333 \
POSTGRES_URL=postgresql://localhost:5432/vargos \
  pnpm dev
```

## Project Structure

```
vargos/
├── src/
│   ├── core/
│   │   ├── services/
│   │   │   └── types.ts          # Service interfaces (IMemoryService, etc.)
│   │   ├── tools/
│   │   │   ├── types.ts          # Tool interfaces
│   │   │   └── base.ts           # BaseTool class
│   │   └── index.ts              # Core exports
│   │
│   ├── services/
│   │   ├── factory.ts            # ServiceFactory + initialization
│   │   ├── memory/
│   │   │   ├── context.ts        # MemoryContext (hybrid search)
│   │   │   ├── sqlite-storage.ts # SQLite persistence
│   │   │   ├── file.ts           # File-based memory
│   │   │   └── qdrant.ts         # Qdrant vector search
│   │   ├── sessions/
│   │   │   ├── file.ts           # JSONL session storage
│   │   │   └── postgres.ts       # PostgreSQL sessions
│   │   ├── browser.ts            # Browser automation
│   │   └── process.ts            # Process management
│   │
│   ├── mcp/
│   │   ├── tools/                # MCP tool implementations
│   │   │   ├── read.ts           # Read files
│   │   │   ├── write.ts          # Write files
│   │   │   ├── edit.ts           # Edit files
│   │   │   ├── exec.ts           # Execute shell commands
│   │   │   ├── process.ts        # Process management
│   │   │   ├── web-fetch.ts      # Web fetching
│   │   │   ├── browser.ts        # Browser automation
│   │   │   ├── memory-search.ts  # Search memory
│   │   │   ├── memory-get.ts     # Read memory files
│   │   │   ├── sessions-list.ts  # List sessions
│   │   │   ├── sessions-send.ts  # Send messages
│   │   │   └── sessions-spawn.ts # Spawn sub-agents
│   │   └── registry.ts           # Tool registration
│   │
│   └── index.ts                  # Entry point
│
├── ARCHITECTURE.md               # Architecture documentation
├── CLAUDE.md                     # Claude Code guidance
└── package.json
```

## MCP Tools (12 Total)

| Category | Tools |
|----------|-------|
| **File** | `read`, `write`, `edit` |
| **Shell** | `exec`, `process` |
| **Web** | `web_fetch`, `browser` |
| **Memory** | `memory_search`, `memory_get` |
| **Sessions** | `sessions_list`, `sessions_send`, `sessions_spawn` |

## Architecture

```
┌─────────────────────────────────────────────┐
│  MCP Tools (12 tools)                       │
│  read, write, edit, exec, process, etc.     │
├─────────────────────────────────────────────┤
│  Service Interface (core/services/types.ts) │
│  IMemoryService, ISessionService            │
├─────────────────────────────────────────────┤
│  Service Implementations (services/)        │
│  FileMemoryService, QdrantMemoryService     │
├─────────────────────────────────────────────┤
│  MemoryContext (services/memory/context.ts) │
│  Hybrid search, SQLite persistence          │
└─────────────────────────────────────────────┘
```

## Configuration

Environment variables control backend selection:

```bash
# Memory backend: file | qdrant | postgres (default: file)
VARGOS_MEMORY_BACKEND=file

# Sessions backend: file | postgres (default: file)
VARGOS_SESSIONS_BACKEND=file

# File backend config
VARGOS_MEMORY_DIR=~/.vargos/memory

# Qdrant config (for vector memory)
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your-api-key

# PostgreSQL config
POSTGRES_URL=postgresql://user:pass@host:port/db

# OpenAI (for embeddings)
OPENAI_API_KEY=sk-xxx
```

## MemoryContext

OpenClaw-style memory system with hybrid search:

```typescript
import { initializeMemoryContext } from './services/memory/context.js';

const memory = await initializeMemoryContext({
  memoryDir: './memory',
  cacheDir: './cache',
  embeddingProvider: 'openai',
  openaiApiKey: process.env.OPENAI_API_KEY,
  sqlite: { dbPath: './memory.db' },  // Persist embeddings
  sessionsDir: './sessions',           // Index transcripts
  enableFileWatcher: true,             // Auto-reindex
});

// Search
const results = await memory.search('option A', { maxResults: 5 });
// [{ chunk, score, citation: 'memory/2026-02-06.md#L10-L25' }]

await memory.close();
```

## Testing

```bash
# Run all tests
pnpm test

# Run once (CI)
pnpm run test:run

# Watch mode
pnpm test -- --watch
```

## Backend Comparison

| Backend | Pros | Cons |
|---------|------|------|
| **File** | Zero deps, fast for small data | Regex search O(n) |
| **Qdrant** | Semantic search, fast vectors | Requires container |
| **Postgres** | ACID, complex queries | Requires DB server |
| **SQLite** | Zero deps, durable, fast | Single-writer |

**Recommendations:**
- **Development:** File + SQLite persistence
- **Production:** Qdrant for memory, Postgres for sessions

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture and design
- **[CLAUDE.md](./CLAUDE.md)** - Claude Code guidance
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines

## License

See [LICENSE.md](./LICENSE.md) for full license terms.

Copyright (c) 2024 Vadi Taslim. All rights reserved.

## Community

- **GitHub Issues**: Bug reports and feature requests
- **Discussions**: Questions and community chat
