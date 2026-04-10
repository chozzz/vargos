# Vargos

**Self-hosted agent OS.** Give any LLM persistent memory, multi-channel presence, tools, scheduling, and sub-agent orchestration — all on your hardware.

## What It Does

- **Event bus gateway** — isolated services communicate through a typed EventEmitterBus with RPC, pub/sub events, and streaming over TCP/JSON-RPC
- **Any LLM** — Anthropic, OpenAI, Google, OpenRouter, Ollama, LM Studio, Groq, Together, DeepSeek, Mistral, Fireworks, Perplexity
- **Multi-channel messaging** — route agent conversations through WhatsApp and Telegram
- **Bus-discovered tools** — every `@register` decorated handler becomes an agent tool automatically
- **MCP server + client** — expose tools to MCP clients and connect to external MCP servers
- **Hybrid memory** — vector + text search over workspace files and session transcripts
- **Scheduled tasks** — cron-based recurring tasks with channel notification delivery
- **Webhooks** — inbound HTTP triggers that fire agent tasks with custom transforms
- **Subagent orchestration** — reuse `agent.execute` with hierarchical session keys
- **Media handling** — image passthrough for vision models, audio transcription via Whisper

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

Services are isolated — no shared state, communication only through `bus.call()` and `bus.emit()`. Domain boundaries are enforced by ESLint.

### Inbound Message Flow

```
User sends message (WhatsApp/Telegram)
  ↓
Channel adapter downloads media, converts to base64
  ↓
ChannelsService: expand links, start typing, init reactions
  ↓
bus.call('agent.execute', { sessionKey, task, images })
  ↓
AgentRuntime: get/create PiAgent session, run prompt
  ↓
Response delivered via bus.call('channel.send')
```

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
| [Roadmap](./docs/ROADMAP.md) | Planned features |

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
pnpm run test:run     # Tests (single run)
pnpm run typecheck    # TypeScript check
pnpm lint             # ESLint + typecheck
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for architecture details, event reference, and development guidelines.

## License

[Apache-2.0](./LICENSE)
