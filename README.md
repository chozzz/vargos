# Vargos

**The MCP runtime for agents.** Run agents locally with any LLM, expose tools via MCP protocol, and route messages through WhatsApp and Telegram. Service-oriented architecture, batteries included.

## Why Vargos

Most agent tooling gives you a library and says "build around this." Vargos is different — it's a complete runtime. Start it, connect your LLM, and you have a full agent stack running: tools, memory, scheduling, and messaging channels.

- **Runtime, not a framework** — runs as a standalone service with a WebSocket gateway
- **MCP-native** — exposes tools via the standard Model Context Protocol
- **Any LLM** — OpenAI, Anthropic, Google, OpenRouter, Ollama, LM Studio
- **Multi-channel** — route agent conversations through WhatsApp and Telegram
- **Service-oriented** — isolated services communicate through RPC + events + streaming
- **Local-first** — runs on your machine, your data stays with you

## Quick Start

**Prerequisites:** Node.js 20+, pnpm

```bash
git clone https://github.com/chozzz/vargos.git
cd vargos
pnpm install

# Start the runtime
pnpm start

# Interactive CLI
pnpm cli

# Chat with your agent
pnpm chat

# One-shot task
pnpm cli run "Analyze this codebase"
```

First run prompts for LLM provider, model, and API key.

## Configuration

All settings live in `~/.vargos/config.json`:

```jsonc
{
  "models": { "anthropic": { "provider": "anthropic", "model": "claude-sonnet-4-20250514" } },
  "agent": { "primary": "anthropic" },
  "gateway": { "port": 9000, "host": "127.0.0.1" },           // optional
  "mcp": { "transport": "http", "port": 9001, "endpoint": "/mcp" }, // optional
  "channels": { ... }                                           // optional
}
```

## Architecture

```
CLI / MCP Clients
       │
       │ WebSocket
       ▼
┌──────────────────────────────────────────────┐
│  Gateway                                     │
│  Request/Response/Event frames               │
│  Router + Event Bus                          │
└──┬───────┬───────┬───────┬───────┬───────────┘
   ▼       ▼       ▼       ▼       ▼
 Agent   Tools  Sessions Channels  Cron
  │                        │
  ▼                        ▼
MCP Bridge          WhatsApp / Telegram
```

Each service is isolated — no shared state, communication only through the gateway protocol.

## CLI

```
vargos                         # Interactive menu
vargos chat                    # Chat session
vargos run <task>              # One-shot task
vargos config llm show         # Display LLM config
vargos config llm edit         # Change provider/model/key
vargos config channel show     # Channel config
vargos config channel edit     # Edit channel config
vargos gateway start           # Start runtime
vargos gateway stop            # Stop runtime
vargos gateway restart         # Restart
vargos gateway status          # Status check
vargos health                  # Connectivity check
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

## MCP Client Integration

Add to your MCP client config (Claude Desktop, etc.):

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
pnpm start                # Start runtime
pnpm test                 # Tests (watch mode)
pnpm run test:run         # Tests (single run)
pnpm run typecheck        # TypeScript check
pnpm lint                 # ESLint + typecheck
```

## Documentation

- **[Getting Started](./docs/getting-started.md)** — Install, first run, config wizard
- **[Configuration](./docs/configuration.md)** — Config reference, model profiles, API keys
- **[CLI](./docs/cli.md)** — Commands, gateway lifecycle, chat/run modes
- **[Architecture](./docs/architecture.md)** — Protocol spec, service contracts, message flows
- **[Channels](./docs/channels.md)** — WhatsApp and Telegram setup
- **[MCP](./docs/mcp.md)** — MCP server, tool list, client integration
- **[Sessions](./docs/sessions.md)** — Session types, storage, lifecycle
- **[Extensions](./docs/extensions.md)** — Tool system, writing extensions
- **[Runtime](./docs/runtime.md)** — Agent runtime, prompt layers, streaming
- **[Troubleshooting](./docs/troubleshooting.md)** — Common issues and fixes
- **[Contributing](./CONTRIBUTING.md)** — How to contribute

## License

[Apache-2.0](./LICENSE.md)
