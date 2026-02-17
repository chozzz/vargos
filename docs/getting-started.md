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

## First Run

```bash
pnpm start
```

First run prompts for LLM provider, model, and API key. Settings are saved to `~/.vargos/config.json`.

Supported providers: Anthropic, OpenAI, Google, OpenRouter, Ollama, LM Studio.

## Chat

```bash
pnpm chat
```

Requires a running gateway. Start one with `pnpm start` or `vargos gateway start`.

## One-Shot Task

```bash
pnpm cli run "Analyze this codebase"
```

## Interactive Menu

```bash
pnpm cli
```

Bare `vargos` (or `pnpm cli`) opens an interactive menu with breadcrumb navigation for all commands.

## What's Next

- [Configuration](./configuration.md) — config reference, model profiles, API keys
- [CLI](./cli.md) — all commands and options
- [Channels](./channels.md) — WhatsApp and Telegram setup
- [MCP](./mcp.md) — MCP server for tool integration
- [Architecture](./architecture.md) — protocol spec, service contracts
