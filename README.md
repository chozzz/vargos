# Vargos

**Self-hosted agent OS.** Give any LLM persistent memory, multi-channel presence, tools, scheduling, and sub-agent orchestration — all on your hardware.

## What It Does

- **Any LLM** — Anthropic, OpenAI, Google, OpenRouter, Ollama, LM Studio, Groq, Together, DeepSeek, Mistral, Fireworks, Perplexity
- **Multi-channel presence** — connect WhatsApp and Telegram bots, route messages to the agent
- **Automatic tool discovery** — every service feature becomes available as an agent tool
- **MCP integration** — expose your agent's tools to other applications, connect external tool servers
- **Persistent memory** — vector + keyword search across workspace files and conversation history
- **Scheduled tasks** — run agent tasks on a schedule, send results to channels
- **Webhooks** — trigger agent tasks from external systems (GitHub, monitoring, etc.)
- **Subagent delegation** — agents can spawn child agents for parallel or hierarchical work
- **Media intelligence** — images and audio handled automatically (vision, transcription)

## Quick Start

```bash
git clone https://github.com/chozzz/vargos.git
cd vargos
pnpm install
pnpm start
```

First run prompts for LLM provider, model, and API key. Config is saved to `~/.vargos/config.json`.

## Architecture

```
                    ┌──────────────────────────────────────┐
                    │  Gateway  (EventEmitterBus + TCP)    │
                    └────────────┬─────────────────────────┘
                                 │
         ┌───────────────────────┼────────────────────────┐
         │                       │                        │
         ↓                       ↓                        ↓
    ┌─────────┐           ┌──────────┐            ┌────────────┐
    │ Config  │           │ Agent    │            │   CLI      │
    │ Log     │           │ Channels │            │  External  │
    │ Memory  │           │ Cron     │            │  Clients   │
    └─────────┘           └──────────┘            └────────────┘
```

Services are isolated — no shared state, communication only through internal APIs. This makes Vargos reliable and easy to extend.

## Key Concepts

- **Agent** — An AI system that reads instructions, sees available tools, and decides what to do to help you
- **Channel** — A messaging platform (WhatsApp, Telegram) where users can talk to the agent
- **System prompt** — Instructions that tell the agent how to behave (from files like CLAUDE.md)
- **Session** — A conversation thread with one user; Vargos remembers previous messages
- **Tool** — A capability the agent can use (read a file, run code, fetch a URL, send a message)
- **Workspace** — Your project folder where Vargos stores instructions, skills, and conversation history

### Message Handling

Messages go through a simple pipeline: **receive → process → execute → respond**. The agent has access to all Vargos tools and your workspace context. See [Channels](./docs/usage/channels.md) for details.

## Documentation

| Doc | Description |
|-----|-------------|
| [Getting Started](./docs/getting-started.md) | Install, first run, config wizard |
| [Configuration](./docs/configuration.md) | Full config reference |
| [Channels](./docs/usage/channels.md) | WhatsApp and Telegram setup |
| [Webhooks](./docs/usage/webhooks.md) | Inbound HTTP triggers |
| [MCP](./docs/usage/mcp.md) | MCP server and client integration |
| [Sessions](./docs/usage/sessions.md) | Session types and lifecycle |
| [Runtime](./docs/usage/runtime.md) | How agents execute |
| [Workspace Files](./docs/usage/workspace-files.md) | AGENTS.md, SOUL.md, TOOLS.md reference |
| [CLI](./docs/usage/cli.md) | Commands and gateway lifecycle |
| [Troubleshooting](./docs/usage/troubleshooting.md) | Common issues and fixes |
| [Roadmap](./docs/ROADMAP.md) | Planned features |

### Examples

- [Webhook Automation](./docs/examples/webhook-automation.md) — GitHub, monitoring alerts
- [MCP Integration](./docs/examples/mcp-integration.md) — Connect external tool servers
- [Scheduled Research](./docs/examples/scheduled-research.md) — Daily reports via cron
- [Multi-Channel Presence](./docs/examples/multi-channel-presence.md) — WhatsApp + Telegram + CLI
- [Architecture Deep Dive](./docs/architecture/bus-design.md) — Event bus patterns
- [Extending](./docs/extending/) — Tools, skills, providers, deployment guides

## Development

```bash
pnpm install          # Install deps
pnpm start            # Start runtime
pnpm test             # Tests (watch mode)
pnpm run test:run     # Tests (single run)
pnpm run typecheck    # TypeScript check
pnpm lint             # ESLint + typecheck
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for architecture details, event reference, and development guidelines.

## License

[Apache-2.0](./LICENSE)
