# Vargos

MCP server with an embedded agent runtime. Gives AI agents practical tools to interact with real-world systems — file ops, shell, memory, sessions, browser, and cron. Routes messages from WhatsApp and Telegram through a plugin-based gateway.

## Quick Start

### Prerequisites

- **Node.js 20+**
- **pnpm**

### Install & Run

```bash
git clone https://github.com/chozzz/vargos.git
cd vargos
pnpm install

# MCP server (stdio mode, for Claude Desktop etc.)
# First run prompts for identity + channel setup
pnpm dev

# Interactive CLI chat
pnpm chat

# One-shot task
tsx src/cli.ts run "Analyze this codebase"

# Channel setup (WhatsApp/Telegram)
tsx src/cli.ts onboard
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
| `read` | Read file contents (5MB limit, image support) |
| `write` | Write/create files (append mode) |
| `edit` | Precise text replacement |
| `exec` | Shell commands (60s timeout) |
| `process` | Background process management |
| `web_fetch` | Fetch + extract readable web content |
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
┌──────────────────────────────────────────────────────────────────┐
│                        Entry Points                              │
│                                                                  │
│  index.ts (MCP server)    cli.ts (chat/run)    boot.ts (shared)  │
└────────────┬─────────────────────┬───────────────────────────────┘
             │                     │
             ▼                     ▼
┌─────────────────────┐  ┌─────────────────────────────────────────┐
│  MCP Protocol       │  │  Channels (WhatsApp, Telegram)          │
│  stdio | HTTP       │  │  dedupe → debounce → gateway → agent    │
│  ListTools          │  │                                         │
│  CallTool           │  │  Gateway (plugin-based message routing)  │
└────────┬────────────┘  └──────────────────┬──────────────────────┘
         │                                  │
         ▼                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│  Tool Registry (15 tools)                                        │
│  read, write, edit, exec, process, web_fetch, browser            │
│  memory_search, memory_get, sessions_*, cron_*                   │
└────────────────────────────┬─────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐
│  Agent Runtime   │ │  Services       │ │  Cron Scheduler         │
│  (Pi SDK)        │ │  Memory (file/  │ │  Heartbeat (30m)        │
│  prompt builder  │ │    qdrant)      │ │  Scheduled tasks        │
│  tool execution  │ │  Sessions (file/│ │  (spawns subagents)     │
│  subagent spawn  │ │    postgres)    │ │                         │
└─────────────────┘ │  Browser        │ └─────────────────────────┘
                    │  Process        │
                    └─────────────────┘
```

### Message Flow

```
                MCP Client                    WhatsApp / Telegram
                    │                              │
                    ▼                              ▼
              ┌──────────┐                  ┌─────────────┐
              │ MCP      │                  │ Channel     │
              │ Server   │                  │ Adapter     │
              └────┬─────┘                  └──────┬──────┘
                   │                               │
                   │  CallToolRequest         dedupe + debounce
                   │                               │
                   ▼                               ▼
              ┌──────────┐                  ┌─────────────┐
              │ Tool     │                  │ Gateway     │
              │ Registry │                  │ (plugins)   │
              └────┬─────┘                  └──────┬──────┘
                   │                               │
                   │  tool.execute()          processAndDeliver()
                   │                               │
                   ▼                               ▼
              ┌──────────┐                  ┌─────────────┐
              │ Services │                  │ Pi Agent    │
              │ (memory, │                  │ Runtime     │
              │ sessions)│                  │ (uses tools)│
              └──────────┘                  └──────┬──────┘
                                                   │
                                              reply via
                                            adapter.send()
```

## Project Structure

```
src/
├── index.ts          # MCP server (stdio + HTTP transport)
├── cli.ts            # CLI: chat, run, config, onboard, scheduler
├── boot.ts           # Shared boot sequence
├── agent/            # Pi agent runtime, prompt builder, lifecycle events
├── tools/            # 15 MCP tool implementations + registry
├── gateway/          # Message gateway with input plugins (text, image, media)
├── channels/         # WhatsApp (Baileys) + Telegram adapters
├── config/           # Paths, validation, onboarding, identity, Pi config
├── services/         # Memory (file/qdrant), sessions (file/postgres), browser, process
├── cron/             # Scheduler, heartbeat, task definitions
└── lib/              # Errors, MIME, dedup, debounce, media, reply delivery
```

## Data Directory

```
~/.vargos/
├── workspace/        # Context files (AGENTS.md, SOUL.md, USER.md, etc.)
│   └── memory/       # Daily notes (YYYY-MM-DD.md)
├── agent/            # Pi SDK config + auth
├── channels.json     # Channel adapter configs
├── channels/         # Channel auth state (WhatsApp linked devices)
├── sessions/         # Session JSONL transcripts
├── memory.db         # SQLite embeddings cache
└── vargos.pid        # Process lock (prevents duplicate instances)
```

**Key distinction:**
- **Working directory** (cwd): Where tools like `read`, `exec` operate
- **Context directory** (`~/.vargos/workspace/`): Agent personality files
- **Data directory** (`~/.vargos/`): Sessions, embeddings, channel state

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `VARGOS_DATA_DIR` | `~/.vargos` | Root data directory |
| `VARGOS_WORKSPACE` | `$DATA_DIR/workspace` | Context files directory |
| `VARGOS_MEMORY_BACKEND` | `file` | Memory: `file` or `qdrant` |
| `VARGOS_SESSIONS_BACKEND` | `file` | Sessions: `file` or `postgres` |
| `VARGOS_TRANSPORT` | `stdio` | MCP transport: `stdio` or `http` |
| `OPENAI_API_KEY` | - | For embeddings + Pi agent |
| `QDRANT_URL` | - | Qdrant server URL |
| `POSTGRES_URL` | - | PostgreSQL connection string |

### Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vargos": {
      "command": "pnpm",
      "args": ["--cwd", "/path/to/vargos", "dev"],
      "env": {
        "VARGOS_WORKSPACE": "/path/to/workspace"
      }
    }
  }
}
```

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
| **SQLite** | Embeddings cache (automatic, always on) |

## Documentation

- **[docs/USAGE.md](./docs/USAGE.md)** — CLI, MCP server, cron, agents
- **[CLAUDE.md](./CLAUDE.md)** — Developer guide (architecture, modules, conventions)
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — Contribution guidelines

## Troubleshooting

**"Another vargos instance is already running"** — Kill existing: `rm ~/.vargos/vargos.pid`

**"Cannot find module '@mariozechner/pi-coding-agent'"** — Run `pnpm install`

**"Qdrant connection refused"** — Start Qdrant: `docker run -p 6333:6333 qdrant/qdrant`

**"OpenAI API key required"** — Set `OPENAI_API_KEY` in `.env`

## License

See [LICENSE.md](./LICENSE.md).
