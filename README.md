# Vargos

**Local-first agent runtime with gateway architecture.** Run agents with any LLM, route conversations through WhatsApp and Telegram, schedule tasks, trigger webhooks, and expose tools via MCP — all from a single service mesh on your machine.

## What It Does

- **Gateway architecture** — isolated services communicate through a WebSocket protocol with RPC, events, and streaming
- **Any LLM** — Anthropic, OpenAI, Google, OpenRouter, Ollama, LM Studio, Groq, Together, DeepSeek, Mistral, Fireworks, Perplexity
- **Multi-channel messaging** — route agent conversations through WhatsApp and Telegram
- **22 built-in tools** — files, shell, browser automation, memory, sessions, cron, processes, and more
- **MCP server + client** — expose tools to MCP clients (Claude Desktop, etc.) and connect to external MCP servers (Atlassian, GitHub, etc.)
- **Hybrid memory** — pgvector + text search over memory files and session transcripts
- **Scheduled tasks** — cron-based recurring tasks with channel notification delivery
- **Webhooks** — inbound HTTP triggers that fire agent tasks with custom transforms
- **Subagent spawning** — isolated child agents with depth-limited nesting
- **Context pruning + compaction** — automatic history management to stay within context windows
- **Media processing** — audio transcription (Whisper) and image description routed to dedicated models

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

## Architecture

```
CLI / MCP Clients / Webhooks
       │
       │ WebSocket
       ▼
┌──────────────────────────────────────────────────────┐
│  Gateway                                             │
│  Request/Response/Event frames                       │
│  Router + Event Bus + Service Registry               │
└──┬───────┬───────┬───────┬───────┬───────┬───────────┘
   ▼       ▼       ▼       ▼       ▼       ▼
 Agent   Tools  Sessions Channels  Cron  Webhooks
  │                        │
  ▼                        ▼
MCP Bridge          WhatsApp / Telegram
```

Each service is isolated — no shared state, communication only through the gateway protocol.

## Tools

| Tool | Description |
|------|-------------|
| `read` | Read file contents (5MB limit, image support) |
| `write` | Write/create files |
| `edit` | Precise text replacement |
| `exec` | Shell commands (60s timeout) |
| `process` | Background process management |
| `web_fetch` | Fetch + extract readable web content |
| `browser` | Browser automation (Playwright) |
| `memory_search` | Hybrid semantic + text search |
| `memory_get` | Read specific memory files |
| `memory_write` | Write/append to memory files |
| `sessions_list` | List active sessions |
| `sessions_history` | Get session transcript |
| `sessions_send` | Send message to session |
| `sessions_spawn` | Spawn subagent |
| `sessions_delete` | Delete a session |
| `cron_add` | Add scheduled task |
| `cron_list` | List scheduled tasks |
| `cron_remove` | Remove a scheduled task |
| `cron_update` | Update a scheduled task |
| `cron_run` | Trigger a task immediately |
| `agent_status` | Show active agent runs |
| `channel_status` | Show channel connection status |
| `config_read` | Read current config (keys masked) |

## CLI

```
vargos                              Interactive menu
vargos chat                         Chat session
vargos run <task>                   One-shot task
vargos health                       Config + connectivity check

vargos gateway start                Start gateway + all services
vargos gateway stop                 Stop running gateway
vargos gateway restart              Restart gateway
vargos gateway status               Check gateway process status
vargos gateway inspect              Show registered services, methods, events, tools

vargos config llm show|edit         LLM provider/model/key
vargos config channel show|edit     Channel config
vargos config context show|edit     Context files
vargos config compaction show|edit  Context pruning & safeguard settings
vargos config heartbeat show|edit   Heartbeat schedule
vargos config heartbeat tasks       Edit HEARTBEAT.md

vargos sessions list                Show all sessions
vargos sessions history <key>       Show session transcript
vargos sessions debug <key>         Show system prompt + processed history

vargos channels send <target> <msg> Send a message to a channel target
vargos cron list|add|remove|trigger Scheduled task management
vargos cron logs [filter]           View past cron executions
vargos webhooks list                Show configured webhooks
vargos webhooks status              Show webhook fire stats
```

## Configuration

All settings live in `~/.vargos/config.json`. See [docs/configuration.md](./docs/configuration.md) for the full reference.

```jsonc
{
  "models": { "anthropic": { "provider": "anthropic", "model": "claude-sonnet-4-20250514" } },
  "agent": { "primary": "anthropic" },
  "gateway": { "port": 9000 },
  "mcp": { "transport": "http", "port": 9001 },
  "mcpServers": { ... },
  "channels": { ... },
  "webhooks": { "hooks": [...] },
  "compaction": { "contextPruning": { ... }, "safeguard": { ... } },
  "cron": { "tasks": [...] }
}
```

## MCP Integration

**As a server** — Vargos exposes all 22 tools via MCP. Add to your MCP client config (Claude Desktop, etc.):

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

**As a client** — Vargos connects to external MCP servers at boot, discovers their tools, and makes them available to the agent as `<server>:<tool_name>`:

```jsonc
{
  "mcpServers": {
    "atlassian": {
      "command": "uvx",
      "args": ["mcp-atlassian"],
      "env": { "JIRA_URL": "...", "JIRA_API_TOKEN": "..." }
    }
  }
}
```

See [docs/mcp.md](./docs/mcp.md) for transport options, OpenAPI spec, and external server config.

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
- **[Webhooks](./docs/webhooks.md)** — Inbound HTTP triggers, transforms, routing
- **[MCP](./docs/mcp.md)** — MCP server, tool list, client integration
- **[Sessions](./docs/sessions.md)** — Session types, storage, lifecycle
- **[Extensions](./docs/extensions.md)** — Tool system, writing extensions
- **[Runtime](./docs/runtime.md)** — Agent runtime, prompt layers, streaming
- **[Workspace Files](./docs/workspace-files.md)** — Workspace structure and files
- **[Troubleshooting](./docs/troubleshooting.md)** — Common issues and fixes
- **[Contributing](./CONTRIBUTING.md)** — How to contribute

## License

[Apache-2.0](./LICENSE.md)
