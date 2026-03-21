# Vargos

**Self-hosted agent OS.** Give any LLM persistent memory, multi-channel presence, tools, scheduling, and sub-agent orchestration — all on your hardware.

## What It Does

- **Gateway architecture** — isolated services communicate through a typed WebSocket protocol with RPC, pub/sub events, and streaming
- **Any LLM** — Anthropic, OpenAI, Google, OpenRouter, Ollama, LM Studio, Groq, Together, DeepSeek, Mistral, Fireworks, Perplexity
- **Multi-channel messaging** — route agent conversations through WhatsApp and Telegram
- **24 built-in tools** — files, shell, browser automation, memory, sessions, cron, processes, and more
- **MCP server + client** — expose tools to MCP clients (Claude Desktop, etc.) and connect to external MCP servers (Atlassian, GitHub, etc.)
- **Hybrid memory** — pgvector + text search over memory files and session transcripts
- **Scheduled tasks** — cron-based recurring tasks with channel notification delivery
- **Webhooks** — inbound HTTP triggers that fire agent tasks with custom transforms
- **Subagent spawning** — isolated child agents with depth-limited nesting
- **Context pruning + compaction** — automatic history management to stay within context windows
- **Media processing** — audio transcription (Whisper) and image description routed to dedicated models
- **Training-ready sessions** — every run captures tool calls, thinking, token usage, and model metadata for fine-tuning

## Quick Start

**Prerequisites:** Node.js 20+, pnpm

```bash
git clone https://github.com/chozzz/vargos.git
cd vargos
pnpm install

# Start the runtime
pnpm start
```

First run prompts for LLM provider, model, and API key.

## Architecture

```
MCP Clients / Webhooks
       │
       │ WebSocket
       ▼
┌──────────────────────────────────────────────────────┐
│  Gateway  (router + event bus + service registry)    │
└──┬───────┬───────┬───────┬───────┬───────┬───────────┘
   ▼       ▼       ▼       ▼       ▼       ▼
 Agent   Tools  Sessions Channels  Cron  Memory

Edge:  src/edge/mcp/  (MCP bridge)   src/edge/webhooks/  (inbound triggers)
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
| `channel_send_media` | Send media file to a channel |
| `config_read` | Read current config (keys masked) |

## CLI

```bash
vargos        # start gateway + all services
```

The interactive CLI is being rebuilt. See [docs/cli.md](./docs/cli.md).

## Configuration

All settings live in `~/.vargos/config.json`. See [docs/configuration.md](./docs/configuration.md) for the full reference.

```jsonc
{
  "models": { "anthropic": { "provider": "anthropic", "model": "claude-sonnet-4-20250514" } },
  "agent": { "primary": "anthropic" },
  "gateway": { "port": 9000 },
  "mcp": { "transport": "http", "port": 9001, "bearerToken": "..." },
  "mcpServers": { ... },
  "channels": { ... },
  "webhooks": { "hooks": [...] },
  "compaction": { "contextPruning": { ... }, "safeguard": { ... } },
  "cron": { "tasks": [...] }
}
```

## MCP Integration

**As a server** — Vargos exposes all 25 tools via MCP. Add to your MCP client config (Claude Desktop, etc.):

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
pnpm install          # Install deps
pnpm start            # Start runtime
pnpm test             # Tests (watch mode)
pnpm run test:run     # Tests (single run)
pnpm run typecheck    # TypeScript check
pnpm lint             # ESLint + typecheck
```

## Documentation

- **[Getting Started](./docs/getting-started.md)** — Install, first run, config wizard
- **[Configuration](./docs/configuration.md)** — Config reference, model profiles, API keys
- **[CLI](./docs/cli.md)** — Commands and gateway lifecycle
- **[Architecture](./docs/architecture.md)** — Protocol spec, service contracts, message flows
- **[Channels](./docs/channels.md)** — WhatsApp and Telegram setup
- **[Webhooks](./docs/webhooks.md)** — Inbound HTTP triggers, transforms, routing
- **[MCP](./docs/mcp.md)** — MCP server, tools, client integration
- **[Sessions](./docs/sessions.md)** — Session types, storage, lifecycle
- **[Runtime](./docs/runtime.md)** — Agent runtime, prompt layers, streaming
- **[Workspace Files](./docs/workspace-files.md)** — Workspace structure and files
- **[Troubleshooting](./docs/troubleshooting.md)** — Common issues and fixes
- **[Contributing](./CONTRIBUTING.md)** — How to contribute

## License

[Apache-2.0](./LICENSE.md)
