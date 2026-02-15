# Vargos Usage Guide

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Configuration](#configuration)
3. [CLI](#cli)
4. [MCP Server](#mcp-server)
5. [Channels](#channels)
6. [Session Management](#session-management)
7. [Cron Scheduler](#cron-scheduler)

---

## Getting Started

```bash
git clone https://github.com/chozzz/vargos.git
cd vargos
pnpm install
pnpm start
```

First run prompts for LLM provider, model, and API key. Settings are saved to `~/.vargos/config.json`.

---

## Configuration

All settings live in a single `config.json` file.

### Location

By default, Vargos stores data in `~/.vargos/`. To change this:

```bash
# Option 1: Set in config.json (highest priority)
{
  "paths": { "dataDir": "/your/custom/path" }
}

# Option 2: Environment variable (bootstrap fallback)
export VARGOS_DATA_DIR=/your/custom/path
```

Priority: `config.paths.dataDir` > `VARGOS_DATA_DIR` env > `~/.vargos`

### Full config.json reference

```jsonc
{
  // Required
  "agent": {
    "provider": "anthropic",      // anthropic, openai, google, openrouter, ollama, lmstudio
    "model": "claude-sonnet-4-20250514",
    "apiKey": "sk-..."            // or use ${PROVIDER}_API_KEY env var
  },

  // Optional — all fields have sensible defaults
  "gateway": {
    "port": 9000,                 // default: 9000
    "host": "127.0.0.1"          // default: 127.0.0.1
  },
  "mcp": {
    "transport": "http",          // http | stdio, default: http
    "host": "127.0.0.1",         // default: 127.0.0.1
    "port": 9001,                 // default: 9001
    "endpoint": "/mcp"            // default: /mcp
  },
  "paths": {
    "dataDir": "~/.vargos",       // default: ~/.vargos
    "workspace": "~/.vargos/workspace"
  },
  "channels": { ... }            // see Channels section
}
```

### API key precedence

`${PROVIDER}_API_KEY` env var takes priority over `agent.apiKey` in config. For example, `ANTHROPIC_API_KEY` overrides the config value when `provider` is `anthropic`.

### Local providers

Ollama and LM Studio need a dummy API key for the Pi SDK. Set `apiKey` to `"local"` in config.

### Edit config

```bash
vargos config llm show           # Display current LLM config
vargos config llm edit           # Change provider/model/key
vargos config channel show       # Display channel config
vargos config channel edit       # Open config.json in $EDITOR
vargos config context show       # List context files
vargos config context edit       # Edit context in $EDITOR
```

---

## CLI

Bare `vargos` shows an interactive menu. Direct commands:

```bash
vargos                           # Interactive menu
vargos chat                      # Chat session (requires running gateway)
vargos run "Analyze this code"   # One-shot task
vargos gateway start             # Start the runtime
vargos gateway stop              # Stop
vargos gateway restart           # Restart
vargos gateway status            # Check if running
vargos health                    # Config + connectivity check
```

---

## MCP Server

When the gateway starts, it exposes tools via MCP protocol. The HTTP transport is the default.

### Endpoints

| URL | Description |
|-----|-------------|
| `http://127.0.0.1:9001/mcp` | MCP protocol (Streamable HTTP) |
| `http://127.0.0.1:9001/openapi.json` | OpenAPI 3.1 spec for all tools |

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

### Stdio mode

For MCP clients that expect stdio transport:

```jsonc
{
  "mcp": { "transport": "stdio" }
}
```

### OpenAPI

`GET /openapi.json` returns an OpenAPI 3.1 spec generated from the tool registry. Each tool maps to a `POST /tools/{name}` operation with its JSON Schema input. Useful for documentation, code generation, or REST-based integrations.

---

## Channels

Vargos routes messages from WhatsApp and Telegram to the agent runtime. Each channel runs as an adapter inside the gateway process.

### WhatsApp

Uses the Baileys library (linked devices protocol). Your phone stays the primary device — Vargos connects as a linked device.

**Prerequisites:** A WhatsApp account on your phone.

**Setup:**

```bash
vargos config channel            # Select WhatsApp
```

1. A QR code appears in your terminal
2. Open WhatsApp on your phone > Settings > Linked Devices > Link a Device
3. Scan the QR code
4. Optionally enter allowed phone numbers (whitelist)

Auth state is saved to `~/.vargos/channels/whatsapp/` and persists across restarts.

**Config:**

```jsonc
{
  "channels": {
    "whatsapp": {
      "enabled": true,
      "allowFrom": ["+1234567890"]  // optional, empty = accept all
    }
  }
}
```

**Re-link (new QR code):**

```bash
rm -rf ~/.vargos/channels/whatsapp/
vargos gateway restart
```

### Telegram

Uses the official Bot API with long-polling. No webhook setup required.

**Prerequisites:** A Telegram account to create a bot.

**Setup:**

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, follow the prompts, copy the bot token
3. Run the setup:

```bash
vargos config channel            # Select Telegram, paste token
```

**Config:**

```jsonc
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "123456789:ABCdef...",
      "allowFrom": ["987654321"]   // optional, chat IDs (not usernames)
    }
  }
}
```

**Finding your chat ID:**

Message your bot, then:

```bash
curl https://api.telegram.org/bot<TOKEN>/getUpdates | jq '.result[0].message.chat.id'
```

### Both channels

```jsonc
{
  "channels": {
    "whatsapp": {
      "enabled": true,
      "allowFrom": ["+1234567890"]
    },
    "telegram": {
      "enabled": true,
      "botToken": "123456789:ABCdef...",
      "allowFrom": ["987654321"]
    }
  }
}
```

### Message flow

```
Incoming message (WhatsApp/Telegram)
    |
    v
Sender filter (allowFrom whitelist)
    |
    v
Dedup (skip if seen in last 120s)
    |
    v
Debounce (batch rapid messages, 1.5s)
    |
    v
Gateway > Agent runtime > Tools
    |
    v
Reply sent back through the channel
```

Both channels support text and media (images, audio, video, documents). Only private/direct messages are processed — group messages are ignored.

### Comparison

| | WhatsApp | Telegram |
|---|---|---|
| Auth | QR code (linked device) | Bot token from @BotFather |
| Protocol | Baileys (WebSocket) | Bot API (HTTP polling) |
| Storage | Auth state on disk (~10MB) | Stateless |
| Dependency | `@whiskeysockets/baileys` | None (raw fetch) |
| Reconnect | Automatic with backoff | Automatic retry after 5s |

---

## Session Management

Sessions persist conversation history as JSONL files in `~/.vargos/sessions/`.

### Session types

| Prefix | Source |
|--------|--------|
| `cli:` | Terminal chat sessions |
| `mcp:` | MCP client connections |
| `wa:` | WhatsApp conversations |
| `tg:` | Telegram conversations |
| `*:subagent:*` | Background agent tasks |
| `cron:*` | Scheduled tasks |

Sessions persist across restarts. Run `vargos chat` again to resume where you left off.

---

## Cron Scheduler

The cron service starts automatically with the gateway. Tasks are added at runtime via the `cron_add` tool.

```
Cron trigger
    |
    v
Create session (cron:task-id:timestamp)
    |
    v
Agent executes with full tool access
    |
    v
Results stored in session transcript
```

---

*For protocol details and service contracts, see [architecture.md](./architecture.md).*
