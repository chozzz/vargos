# Vargos

**Vargos** is an MCP (Model Context Protocol) server with an embedded Pi coding agent runtime. It gives AI agents practical tools to interact with real-world systems, with OpenClaw-style memory, sessions, and subagent support.

> Built for extensibility, modularity, and self-hosting from the ground up.

## Overview

Vargos exposes **13 MCP tools** and an embedded **Pi Agent Runtime** that enables:
- Read, write, and edit files
- Execute shell commands and manage processes
- Search memory with hybrid semantic + text search
- Manage browser automation
- List, send, and spawn agent sessions
- **Spawn Pi-powered subagents** with automatic result announcement

**Key Features:**
- 🤖 **Embedded Pi Runtime** - Full Pi coding agent with compaction, branching, and native tools
- 🔧 **13 MCP Tools** - File, shell, web, memory, and session tools
- 🔄 **Swappable Backends** - File, Qdrant, or PostgreSQL for memory/sessions
- 🧠 **OpenClaw-style Memory** - Hybrid search with chunking and citations
- 💬 **Session Management** - Main/subagent sessions with transcript history
- 📢 **Subagent Announce** - Automatic result announcement to parent sessions
- 💾 **SQLite Persistence** - Embeddings cached for fast restarts
- ✅ **56 Tests** - Full test coverage with Vitest

---

## Quick Start

### Prerequisites

- **Node.js 22+** (required by Pi SDK)
- **pnpm** (or npm)
- **Git**

### Installation

```bash
git clone https://github.com/chozzz/vargos.git
cd vargos
pnpm install
```

### Configuration

Vargos uses **environment variables** for configuration. You can set them in a `.env` file:

```bash
# Create .env file
cp .env.example .env

# Edit with your settings
nano .env
```

**Minimal required config (File backends):**
```bash
# No external services needed - uses local files
VARGOS_WORKSPACE=./workspace
```

**With Qdrant + PostgreSQL:**
```bash
VARGOS_MEMORY_BACKEND=qdrant
VARGOS_SESSIONS_BACKEND=postgres
QDRANT_URL=http://localhost:6333
POSTGRES_URL=postgresql://user:pass@localhost:5432/vargos
OPENAI_API_KEY=sk-xxx  # Required for embeddings
```

See [Configuration](#configuration) for all options.

---

## Usage

### 1. Interactive CLI Chat

Start an interactive chat session with the Pi agent:

```bash
# Uses file backends by default
pnpm cli chat

# With custom workspace
pnpm cli chat -w ./my-project

# With specific model
pnpm cli chat -m gpt-4o -p openai
```

You'll see:
```
🤖 Vargos CLI
Workspace: /home/user/.vargos/workspace
Model: openai/gpt-4o-mini
Memory: file (local)
Sessions: file (local)
Context files: AGENTS.md, TOOLS.md

Type your message, or "exit" to quit.

You: _
```

### 2. Run a Single Task

Execute one task and exit:

```bash
pnpm cli run "Analyze this codebase for security issues"

# With custom workspace
pnpm cli run "Refactor the auth module" -w ./src
```

### 3. MCP Server Mode

Run as an MCP server (for Claude Desktop, etc.):

```bash
# Stdio mode (for Claude Desktop)
pnpm cli server

# Or directly
pnpm dev
```

You'll see startup logs:
```
🔧 Vargos MCP Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Version: 0.0.1
Mode: stdio

📁 Configuration:
  Workspace: /home/user/.vargos/workspace
  Memory: file (./memory)
  Sessions: file (./sessions)
  
🔌 Services:
  ✓ MemoryContext initialized
  ✓ SessionService initialized
  ✓ PiAgentRuntime initialized
  
📝 Context Files:
  ✓ AGENTS.md
  ✓ TOOLS.md
  ✗ SOUL.md (optional)
  ✗ USER.md (optional)

📡 Server:
  Transport: stdio
  Tools: 13 registered
  
✅ Ready for connections
```

---

## Testing

### Run All Tests
```bash
pnpm test
```

### Run Once (CI)
```bash
pnpm run test:run
```

### Test Specific Tool
```bash
pnpm test -- src/mcp/tools/sessions.test.ts
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VARGOS_WORKSPACE` | No | `./workspace` | Working directory for files |
| `VARGOS_MEMORY_BACKEND` | No | `file` | Memory backend: `file`, `qdrant`, `postgres` |
| `VARGOS_SESSIONS_BACKEND` | No | `file` | Sessions backend: `file`, `postgres` |
| `VARGOS_MEMORY_DIR` | No | `./memory` | File backend memory directory |
| `OPENAI_API_KEY` | For Qdrant | - | OpenAI API key for embeddings |
| `QDRANT_URL` | For Qdrant | - | Qdrant server URL |
| `QDRANT_API_KEY` | For Qdrant | - | Qdrant API key (if auth enabled) |
| `POSTGRES_URL` | For Postgres | - | PostgreSQL connection string |

### Interactive Configuration

If required config is missing, Vargos will prompt you interactively:

```bash
$ pnpm cli chat
🔧 Vargos Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  Missing required configuration:

1. OPENAI_API_KEY (required for Qdrant embeddings)
   Why: Embeddings are needed for semantic memory search.
   Get one at: https://platform.openai.com/api-keys
   
   Enter OPENAI_API_KEY: sk-xxx...

2. QDRANT_URL (optional, press Enter to skip)
   Why: Qdrant provides vector search for memory.
   Default: http://localhost:6333
   
   Enter QDRANT_URL: http://localhost:6333

✅ Configuration saved to .env

🤖 Vargos CLI
...
```

---

## MCP Tools (13 Total)

| Tool | Description |
|------|-------------|
| `read` | Read file contents |
| `write` | Write/create files |
| `edit` | Edit files with precise replacements |
| `exec` | Execute shell commands |
| `process` | Manage background processes |
| `web_fetch` | Fetch and extract web content |
| `browser` | Browser automation (Playwright) |
| `memory_search` | Hybrid semantic + text search |
| `memory_get` | Read specific memory files |
| `sessions_list` | List active sessions |
| `sessions_history` | Get session transcript |
| `sessions_send` | Send message to session |
| `sessions_spawn` | Spawn Pi-powered subagent |

### Subagent Example

Spawn a subagent to analyze code:

```typescript
// In a session
await sessions_spawn({
  task: "Analyze src/auth.ts for security vulnerabilities",
  label: "security-audit",
  model: "gpt-4o"
});

// Subagent runs in background with minimal context
// Result announced to parent when complete:
// "## Sub-agent Complete
//  **Status:** success
//  **Result:** Found 2 issues: ..."
```

Subagents:
- Get **minimal context** (only AGENTS.md + TOOLS.md)
- Cannot spawn other subagents
- Results announced back to parent automatically
- Have their own Pi session file for full transcript

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  MCP Tools (13 tools)                       │
│  read, write, exec, memory_search, etc.     │
├─────────────────────────────────────────────┤
│  Pi Agent Runtime (src/pi/runtime.ts)       │
│  Embedded Pi SDK with event hooks           │
├─────────────────────────────────────────────┤
│  Service Interface (core/services/types.ts) │
│  IMemoryService, ISessionService            │
├─────────────────────────────────────────────┤
│  Service Implementations (services/)        │
│  FileMemoryService, QdrantMemoryService     │
│  FileSessionService, PostgresSessionService │
├─────────────────────────────────────────────┤
│  MemoryContext (services/memory/context.ts) │
│  Hybrid search, SQLite persistence          │
└─────────────────────────────────────────────┘
```

---

## Project Structure

```
vargos/
├── src/
│   ├── agent/
│   │   ├── prompt.ts          # System prompt builder (full/minimal modes)
│   │   └── compaction.ts      # Context window management
│   ├── pi/
│   │   └── runtime.ts         # Pi SDK integration
│   ├── cli.ts                 # Interactive CLI entry point
│   ├── index.ts               # MCP server entry point
│   └── ...
├── AGENTS.md                  # Agent behavior rules
├── TOOLS.md                   # Local tool notes
├── SOUL.md                    # Agent identity (optional)
├── USER.md                    # User preferences (optional)
└── README.md                  # This file
```

---

## Backend Comparison

| Backend | Pros | Cons | Best For |
|---------|------|------|----------|
| **File** | Zero deps, fast for small data | Regex search O(n) | Development, small projects |
| **Qdrant** | Semantic search, fast vectors | Requires container | Production, large memory |
| **Postgres** | ACID, complex queries | Requires DB server | Production, sessions |
| **SQLite** | Zero deps, durable, fast | Single-writer | Embeddings cache |

**Recommendations:**
- **Development:** File + SQLite persistence
- **Production:** Qdrant for memory, Postgres for sessions

---

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture
- **[CLAUDE.md](./CLAUDE.md)** - Claude Code guidance
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines

---

## Troubleshooting

### "Cannot find module '@mariozechner/pi-coding-agent'"
```bash
pnpm install
```

### "Qdrant connection refused"
```bash
# Start Qdrant
docker run -p 6333:6333 qdrant/qdrant
```

### "OpenAI API key required"
```bash
export OPENAI_API_KEY=sk-xxx
# Or add to .env
```

### Tests failing
```bash
# Rebuild sqlite3 (if native bindings issue)
pnpm rebuild sqlite3

# Run tests
pnpm run test:run
```

---

## License

See [LICENSE.md](./LICENSE.md) for full license terms.

Copyright (c) 2024 Vadi Taslim. All rights reserved.

## Community

- **GitHub Issues**: Bug reports and feature requests
- **Discussions**: Questions and community chat
