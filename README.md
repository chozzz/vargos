# Vargos

**Self-hosted agent OS.** Give any LLM persistent memory, multi-channel presence, tools, scheduling, and sub-agent orchestration — all on your hardware.

## What It Does

- **Gateway architecture** — isolated services communicate through a typed WebSocket protocol with RPC, pub/sub events, and streaming
- **Any LLM** — Anthropic, OpenAI, Google, OpenRouter, Ollama, LM Studio, Groq, Together, DeepSeek, Mistral, Fireworks, Perplexity
- **Multi-channel messaging** — route agent conversations through WhatsApp and Telegram
- **24 built-in tools** — files, shell, browser automation, memory, sessions, cron, processes, and more
- **MCP server + client** — expose tools to MCP clients and connect to external MCP servers
- **Hybrid memory** — pgvector + text search over memory files and session transcripts
- **Scheduled tasks** — cron-based recurring tasks with channel notification delivery
- **Webhooks** — inbound HTTP triggers that fire agent tasks with custom transforms
- **Subagent spawning** — isolated child agents with depth-limited nesting
- **Context pruning** — automatic history management to stay within context windows

## Quick Start

```bash
git clone https://github.com/chozzz/vargos.git
cd vargos
pnpm install
pnpm start
```

First run prompts for LLM provider, model, and API key.

## Architecture

```
                    ┌──────────────────────────────────────┐
                    │  Gateway  (router + event bus)       │
                    └────────────┬─────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
        ↓                        ↓                        ↓
   ┌─────────┐           ┌──────────┐            ┌────────────┐
   │ Config  │           │ Agent    │            │   CLI      │
   │ Log     │           │ Channels │            │  External  │
   │ Sessions│           │ Cron     │            │  Clients   │
   │ Memory  │           │ Tools    │            │            │
   └─────────┘           └──────────┘            └────────────┘
```

Each service is isolated — no shared state, communication only through the gateway protocol.

## Documentation

| Doc | Description |
|-----|-------------|
| [Getting Started](./docs/getting-started.md) | Install, first run, config wizard |
| [Configuration](./docs/configuration.md) | Full config reference |
| [Channels](./docs/channels.md) | WhatsApp and Telegram setup |
| [Webhooks](./docs/webhooks.md) | Inbound HTTP triggers |
| [MCP](./docs/mcp.md) | MCP server and client integration |
| [Sessions](./docs/sessions.md) | Session types and lifecycle |
| [Runtime](./docs/runtime.md) | How agents execute |
| [Workspace Files](./docs/workspace-files.md) | AGENTS.md, SOUL.md, TOOLS.md reference |
| [CLI](./docs/cli.md) | Commands and gateway lifecycle |
| [Troubleshooting](./docs/troubleshooting.md) | Common issues and fixes |

### Examples

- [Webhook Automation](./docs/examples/webhook-automation.md) — GitHub, monitoring alerts
- [MCP Integration](./docs/examples/mcp-integration.md) — Connect external tool servers
- [Scheduled Research](./docs/examples/scheduled-research.md) — Daily reports via cron
- [Multi-Channel Presence](./docs/examples/multi-channel-presence.md) — WhatsApp + Telegram + CLI

## Development

```bash
pnpm install          # Install deps
pnpm start            # Start runtime
pnpm test             # Tests (watch mode)
pnpm run typecheck    # TypeScript check
pnpm lint             # ESLint + typecheck
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for architecture details, event reference, and development guidelines.

## License

[Apache-2.0](./LICENSE)
