# Vargos

MCP server with an embedded agent runtime. Gives AI agents practical tools to interact with real-world systems — file ops, shell, memory, sessions, browser, and cron.

## Quick Start

### Prerequisites

- **Node.js 20+**
- **pnpm**

### Install & Run

```bash
git clone https://github.com/chozzz/vargos.git
cd vargos
pnpm install

# Interactive CLI
pnpm cli chat

# MCP server (stdio, for Claude Desktop etc.)
# First run prompts for identity + channel setup
pnpm cli server

# Set up WhatsApp/Telegram channels
pnpm cli onboard

# One-shot task
pnpm cli run "Analyze this codebase"
```

### Configuration

```bash
cp .env.example .env
```

Minimal setup uses file backends with no external services. Data stored in `~/.vargos/`.

For Qdrant + PostgreSQL, see `.env.example` for all options.

## MCP Tools (15)

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
| `cron_add` | Add scheduled task |
| `cron_list` | List scheduled tasks |

## Architecture

```
┌─────────────────────────────────────────────┐
│  MCP Tools (15 tools)                       │
│  read, write, exec, memory_search, etc.     │
├─────────────────────────────────────────────┤
│  Pi Agent Runtime (src/pi/runtime.ts)       │
│  Unified agent for CLI + MCP server         │
├─────────────────────────────────────────────┤
│  Service Interfaces (core/services/types.ts)│
│  IMemoryService, ISessionService            │
├─────────────────────────────────────────────┤
│  Service Implementations (services/)        │
│  File, Qdrant, PostgreSQL backends          │
├─────────────────────────────────────────────┤
│  MemoryContext (services/memory/context.ts) │
│  Hybrid search, SQLite persistence          │
└─────────────────────────────────────────────┘
```

## Project Structure

```
vargos/
├── src/
│   ├── agent/              # Agent lifecycle, prompt, queue
│   ├── channels/           # WhatsApp + Telegram adapters
│   ├── config/             # Paths, workspace, identity, Pi config
│   ├── core/               # Interfaces (services, tools)
│   ├── cron/               # Scheduler, heartbeat runner, task definitions
│   ├── gateway/            # Message gateway (transports, plugins)
│   ├── lib/                # Shared utilities (mime, path)
│   ├── mcp/tools/          # 15 MCP tool implementations
│   ├── pi/                 # Pi Agent Runtime + extension
│   ├── services/           # Memory, sessions, browser, process
│   ├── utils/              # Error handling
│   ├── cli.ts              # CLI entry point
│   └── index.ts            # MCP server entry point
├── docs/
│   └── USAGE.md            # Detailed usage guide
├── CLAUDE.md
├── CONTRIBUTING.md
└── LICENSE.md
```

## Data Directory

```
~/.vargos/
├── workspace/          # Context files (AGENTS.md, SOUL.md, etc.)
├── agent/              # Pi SDK configuration
├── channels.json       # Channel adapter configs
├── channels/           # Channel auth state (WhatsApp etc.)
├── sessions/           # Session JSONL transcripts
└── memory.db           # SQLite embeddings cache
```

**Key distinction:**
- **Working directory** (cwd): Where tools like `read`, `exec` operate
- **Context directory** (`~/.vargos/workspace/`): Agent personality files
- **Data directory** (`~/.vargos/`): Sessions and embeddings

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `VARGOS_DATA_DIR` | `~/.vargos` | Root data directory |
| `VARGOS_WORKSPACE` | `$DATA_DIR/workspace` | Context files directory |
| `VARGOS_MEMORY_BACKEND` | `file` | Memory: `file` or `qdrant` |
| `VARGOS_SESSIONS_BACKEND` | `file` | Sessions: `file` or `postgres` |
| `OPENAI_API_KEY` | - | For Qdrant embeddings |
| `QDRANT_URL` | - | Qdrant server URL |
| `POSTGRES_URL` | - | PostgreSQL connection string |
| `VARGOS_TRANSPORT` | `stdio` | MCP transport: `stdio` or `http` |

## Testing

```bash
pnpm test              # Watch mode
pnpm run test:run      # CI mode
```

## Backend Comparison

| Backend | Best For |
|---------|----------|
| **File** | Development, small projects (zero deps) |
| **Qdrant** | Production memory (semantic search) |
| **Postgres** | Production sessions (ACID, indexing) |
| **SQLite** | Embeddings cache (automatic) |

## Documentation

- **[docs/USAGE.md](./docs/USAGE.md)** - CLI, MCP server, cron, agents
- **[CLAUDE.md](./CLAUDE.md)** - Developer guide for Claude Code
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines

## Troubleshooting

**"Cannot find module '@mariozechner/pi-coding-agent'"** — Run `pnpm install`

**"Qdrant connection refused"** — Start Qdrant: `docker run -p 6333:6333 qdrant/qdrant`

**"OpenAI API key required"** — Set `OPENAI_API_KEY` in `.env`

## License

See [LICENSE.md](./LICENSE.md).
