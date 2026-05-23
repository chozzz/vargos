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
# Quick: npx runs the setup wizard automatically on first run
npx @chozzz/vargos

# Or boot the server directly (wizard runs automatically if unconfigured)
pnpm start
```

This boots the gateway and all services. On first run, the interactive setup wizard prompts for provider, model, and API key, then writes config to `~/.vargos/`. [`lib/templates.ts`](../lib/templates.ts) also seeds defaults from [`.templates/`](../.templates/) into `~/.vargos/`.

You'll need at minimum:
- A provider entry in `~/.vargos/agent/models.json` and credentials in `~/.vargos/agent/auth.json` (or the matching `${PROVIDER}_API_KEY` env var)
- `defaultProvider` + `defaultModel` set in `~/.vargos/agent/settings.json`

Supported providers (registered out of the box, configure as needed): Anthropic, OpenAI, Google, OpenRouter, Ollama, LM Studio, Groq, Together, DeepSeek, Mistral, Fireworks, Perplexity, vLLM.

## CLI management

```bash
vargos                 # First-run wizard or help
vargos start           # Boot the server
vargos onboard         # Re-run setup wizard
vargos config          # Show current configuration
```

## Pi CLI mode

```bash
pnpm chat                     # interactive Pi SDK REPL bound to ~/.vargos/agent
pnpm chat "what's in /tmp?"   # one-shot
```

`pnpm chat` execs `pi` (Pi SDK CLI) with `PI_CODING_AGENT_DIR=$HOME/.vargos/agent` and `--session-dir $HOME/.vargos/sessions/cli`. Sessions land alongside channel/cron sessions and are searchable by the memory indexer.

## Connecting channels

Edit `~/.vargos/config.json` `channels[]` to add Telegram or WhatsApp adapters. See [Channels](./usage/channels.md).

## Manual reseed

```bash
pnpm seed
```

Re-runs the `.templates/` → `~/.vargos/` recursive copy. Copy-missing only — existing files are always preserved.

## What's next

- [Configuration](./configuration.md) — full config reference
- [Channels](./usage/channels.md) — WhatsApp and Telegram setup
- [Personas](./usage/personas.md) — per-channel behavior overrides
- [Runtime](./usage/runtime.md) — execution flow
- [MCP](./usage/mcp.md) — connect external MCP servers
