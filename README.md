# Vargos

Agentic MCP server with an embedded agent runtime. Independent services (agent, tools, sessions, channels, cron) communicate through a WebSocket gateway. Exposes tools via MCP protocol and routes messages from WhatsApp and Telegram.

## Quick Start

### Prerequisites

- **Node.js 20+**
- **pnpm**

### Install & Run

```bash
git clone https://github.com/chozzz/vargos.git
cd vargos
pnpm install

# Start gateway + all services
pnpm start

# Interactive CLI menu
pnpm cli

# Chat with the agent (requires gateway running)
pnpm chat

# One-shot task
pnpm cli run "Analyze this codebase"
```

First run prompts for LLM provider, model, and API key.

### Configuration

All settings live in `~/.vargos/config.json`:

```jsonc
{
  "agent": { "provider": "anthropic", "model": "claude-3-5-sonnet" },
  "gateway": { "port": 9000, "host": "127.0.0.1" },           // optional
  "mcp": { "transport": "http", "port": 9001, "endpoint": "/mcp" }, // optional
  "channels": { ... }                                           // optional
}
```

Supports cloud providers (OpenAI, Anthropic, Google, OpenRouter) and local providers (Ollama, LM Studio).

## CLI

```
vargos                         # Interactive menu
vargos chat                    # Interactive chat (requires gateway)
vargos run <task>              # One-shot task
vargos config llm show         # Display LLM config
vargos config llm edit         # Change provider/model/key
vargos config channel show     # Display channel config
vargos config channel edit     # Edit channel config
vargos gateway start           # Start gateway + all services
vargos gateway stop            # Stop running gateway
vargos gateway restart         # Restart via SIGUSR2
vargos gateway status          # PID check
vargos health                  # Config + connectivity check
```

## MCP Tools

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
| `sessions_spawn` | Spawn subagent |
| `cron_add` | Add scheduled task |
| `cron_list` | List scheduled tasks |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  CLI (src/cli/)                                         │
│  Interactive menu | Direct commands | Chat | Run        │
└────────────┬────────────────────────────────────────────┘
             │ WebSocket (ws://127.0.0.1:9000)
             ▼
┌─────────────────────────────────────────────────────────┐
│  Gateway (src/gateway/)                                 │
│  WebSocket server | Protocol | Router | Event Bus       │
│  Three frame types: Request, Response, Event            │
└────┬──────────┬──────────┬──────────┬──────────┬────────┘
     ▼          ▼          ▼          ▼          ▼
  Agent      Tools     Sessions   Channels     Cron
  Service    Service   Service    Service     Service
  (run,      (execute, (CRUD,     (send,      (schedule,
   abort,     list,     history)   status)     trigger)
   status)    describe)
     │                                │
     │                                ▼
     │                         WhatsApp / Telegram
     ▼                         Channel Adapters
  MCP Bridge
  (stdio | HTTP)
  ← MCP Clients
```

Services are isolated — they share nothing and communicate only through the gateway.

## Project Structure

```
src/
├── cli/                  # Entry point, interactive menu, config/gateway actions
├── gateway/              # WebSocket server, protocol, router, event bus
├── services/             # Gateway services (agent, tools, sessions, channels, cron)
├── mcp/                  # MCP bridge (MCP protocol ↔ gateway RPC)
├── core/                 # Framework: config, runtime, tools, channels, extensions
└── extensions/           # Built-in tools, channel adapters, file services
```

## Data Directory

```
~/.vargos/
├── config.json           # All configuration
├── workspace/            # Context files (AGENTS.md, SOUL.md, USER.md, etc.)
│   └── memory/           # Daily notes
├── agent/                # Pi SDK config + auth (synced from config.json)
├── channels/             # Channel auth state (WhatsApp linked devices)
├── sessions/             # Session JSONL transcripts
├── memory.db             # SQLite embeddings cache
└── vargos.pid            # Process lock
```

## Claude Desktop / MCP Client

Add to your MCP client config:

```json
{
  "mcpServers": {
    "vargos": {
      "command": "pnpm",
      "args": ["--cwd", "/path/to/vargos", "start"]
    }
  }
}
```

## Development

```bash
pnpm install              # Install deps
pnpm start                # Start gateway + all services
pnpm test                 # Tests (watch mode)
pnpm run test:run         # Tests (CI, run once)
pnpm run typecheck        # TypeScript check
pnpm lint                 # ESLint + typecheck
```

## Documentation

- **[Architecture](./docs/architecture.md)** — Protocol spec, service contracts, message flows
- **[Usage Guide](./docs/USAGE.md)** — Detailed CLI usage, MCP setup, channels
- **[Contributing](./CONTRIBUTING.md)** — Contribution guidelines

## Troubleshooting

**"Another vargos instance is already running"** — Kill existing: `rm ~/.vargos/vargos.pid`

**"Cannot find module '@mariozechner/pi-coding-agent'"** — Run `pnpm install`

## License

See [LICENSE.md](./LICENSE.md).
