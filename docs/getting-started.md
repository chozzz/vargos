# Getting Started

## Prerequisites
- Node.js 20+
- pnpm

## Install

```bash
git clone https://github.com/chozzz/vargos.git
cd vargos
pnpm install
```

## First run

```bash
pnpm start
```

This boots the gateway and all services. On first run, [`lib/templates.ts`](../lib/templates.ts) seeds defaults from [`.templates/vargos/`](../.templates/vargos/) into `~/.vargos/`.

You'll need at minimum:
- A provider entry in `~/.vargos/agent/models.json` and credentials in `~/.vargos/agent/auth.json` (or the matching `${PROVIDER}_API_KEY` env var)
- `defaultProvider` + `defaultModel` set in `~/.vargos/agent/settings.json`

Supported providers (registered out of the box, configure as needed): Anthropic, OpenAI, Google, OpenRouter, Ollama, LM Studio, Groq, Together, DeepSeek, Mistral, Fireworks, Perplexity, vLLM.

## Pi CLI mode

```bash
pnpm cli                     # interactive Pi CLI bound to ~/.vargos/agent
pnpm cli "what's in /tmp?"   # one-shot
```

`pnpm cli` execs `pi` (Pi SDK CLI) with `PI_CODING_AGENT_DIR=$HOME/.vargos/agent` and `--session-dir $HOME/.vargos/sessions/cli`. Sessions land alongside channel/cron sessions and are searchable by the memory indexer.

## Connecting channels

Edit `~/.vargos/config.json` `channels[]` to add Telegram or WhatsApp adapters. See [Channels](./usage/channels.md).

## Manual reseed

```bash
pnpm seed
```

Re-runs the `.templates/vargos/` → `~/.vargos/` recursive copy. Idempotent; doesn't overwrite existing files.

## What's next

- [Configuration](./configuration.md) — full config reference
- [Channels](./usage/channels.md) — WhatsApp and Telegram setup
- [Personas](./usage/personas.md) — per-channel behavior overrides
- [Runtime](./usage/runtime.md) — execution flow
- [MCP](./usage/mcp.md) — connect external MCP servers
