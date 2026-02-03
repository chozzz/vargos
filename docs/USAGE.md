# Vargos Usage Guide

Complete guide to using Vargos: CLI, MCP server, cron scheduler, and background agents.

---

## Table of Contents

1. [CLI Mode](#cli-mode)
2. [MCP Server Mode](#mcp-server-mode)
3. [Cron Scheduler](#cron-scheduler)
4. [Background Agents](#background-agents)
5. [Session Management](#session-management)
6. [Channels](#channels)

---

## CLI Mode

Interactive command-line interface for chatting with the Vargos agent.

### Start Interactive Chat

```bash
# Default session
pnpm chat

# Named session (for continuity)
tsx src/cli.ts chat -s myproject

# With specific model
tsx src/cli.ts chat -m gpt-4o -p openai

# With custom workspace directory
tsx src/cli.ts chat -w ./my-project
```

### Run One-Shot Task

Execute a single task and exit:

```bash
tsx src/cli.ts run "Analyze this codebase for security issues"
tsx src/cli.ts run "Refactor src/auth.ts to use DI" -w ./src
```

---

## MCP Server Mode

Run Vargos as an MCP server for Claude Desktop, Cursor, or other MCP clients.

### Start MCP Server

```bash
# Stdio mode (default, for Claude Desktop)
pnpm dev

# HTTP mode
VARGOS_TRANSPORT=http VARGOS_PORT=3000 pnpm dev
```

On first run, you'll be prompted to set up your identity (name, timezone) and configure a communication channel (WhatsApp or Telegram). Subsequent runs skip these prompts.

**Startup output:**
```
  Vargos v0.0.1

  Config
    Data      ~/.vargos
    Workspace ~/.vargos/workspace
    Memory    file
    Sessions  file
    Transport stdio

  Context (5 of 7 loaded)
    AGENTS.md  SOUL.md  USER.md  TOOLS.md  HEARTBEAT.md

  Tools (15)
    File      read, write, edit
    Shell     exec, process
    Web       web_fetch, browser
    Memory    memory_search, memory_get
    Session   sessions_list, sessions_history, sessions_send, sessions_spawn
    Cron      cron_add, cron_list

  Services     ok
    Scheduler  0 task(s)
    Heartbeat  off (empty)

  Channels
    whatsapp  connected

  Listening on stdio
```

### Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vargos": {
      "command": "pnpm",
      "args": ["--cwd", "/path/to/vargos", "dev"],
      "env": {
        "VARGOS_WORKSPACE": "/path/to/workspace"
      }
    }
  }
}
```

### How MCP Tools Work

MCP clients send `CallToolRequest` → Vargos looks up the tool in the registry → executes with context (sessionKey, workingDir) → returns `CallToolResult`.

```
MCP Client → CallToolRequest("read", {path: "README.md"})
           → ToolRegistry.get("read")
           → ReadTool.execute({path: "README.md"}, context)
           → { content: [{ type: "text", text: "# Vargos..." }] }
```

---

## Cron Scheduler

Automate periodic tasks with scheduled background agents.

### How It Works

The cron scheduler starts automatically with `pnpm dev`. Tasks are added via the `cron_add` MCP tool at runtime.

For standalone testing:

```bash
tsx src/cli.ts scheduler
```

**Execution flow:**

```
Cron trigger
    ↓
Create session (cron:task-id:timestamp)
    ↓
Spawn subagent with task
    ↓
Agent executes (full tool access)
    ↓
Results stored in session transcript
```

### Heartbeat

The heartbeat runner checks `HEARTBEAT.md` every 30 minutes. If the file has actionable content (not just headers/comments), it sends the content to the agent. If nothing needs attention, the agent replies `HEARTBEAT_OK` and the cycle is silent.

Add tasks to `~/.vargos/workspace/HEARTBEAT.md` when you want periodic agent attention. Leave it empty to save API cost.

---

## Background Agents

Spawn agents that run independently and report back.

### Spawning

```bash
# In CLI chat
pnpm chat

You: Spawn an agent to analyze test coverage and write results to memory/results/coverage.md
```

### How It Works

```
Parent Session
    ↓
sessions_spawn tool called
    ↓
Create child session (parent:subagent:child-id)
    ↓
Start Pi Runtime with minimal context (AGENTS.md + TOOLS.md)
    ↓
Agent executes task independently
    ↓
On completion → announce result to parent session
```

**Subagent restrictions:**
- Cannot spawn other subagents
- Minimal context (AGENTS.md + TOOLS.md only)
- Cannot use session tools (sessions_list, sessions_send, etc.)

---

## Session Management

Sessions persist conversation history as JSONL files.

### Session Types

| Type | Prefix | Use Case |
|------|--------|----------|
| CLI | `cli:` | Interactive terminal sessions |
| MCP | `default` | MCP client connections |
| Subagent | `*:subagent:*` | Background tasks |
| Cron | `cron:*` | Scheduled tasks |
| Channel | `wa:*`, `tg:*` | WhatsApp/Telegram conversations |

### Session Continuity

Sessions persist across restarts:

```bash
# Monday
pnpm chat
# ... work on project ...
# Ctrl+C

# Tuesday — resume same session
pnpm chat
# Context preserved, can continue conversation
```

Named sessions for project separation:

```bash
tsx src/cli.ts chat -s backend-api
tsx src/cli.ts chat -s frontend-ui
```

### Storage

Session transcripts stored as JSONL in `~/.vargos/sessions/`.

```bash
# View raw transcript
jq . ~/.vargos/sessions/cli-main.jsonl
```

---

## Channels

Vargos routes messages from WhatsApp and Telegram through the gateway to the agent runtime.

### Setup

```bash
tsx src/cli.ts onboard
```

Or channels are auto-configured on first `pnpm dev` run (TTY only).

### WhatsApp

- Uses Baileys library (linked devices protocol)
- QR code displayed in terminal for pairing
- Messages deduplicated (120s TTL) and debounced (1.5s batch)
- Auto-reconnects with exponential backoff
- Auth state persisted in `~/.vargos/channels/whatsapp/`

### Telegram

- Bot token authentication
- Long-polling for updates
- Sender whitelist support (`allowFrom` in config)
- Supports text, photos, voice, audio, documents

### Message Flow

```
Incoming message (WhatsApp/Telegram)
    ↓
Channel adapter receives
    ↓
Dedup cache (skip if seen in last 120s)
    ↓
Debouncer (batch rapid messages, 1.5s delay)
    ↓
Gateway.processAndDeliver()
    ↓
Plugin selected by type (text/image/voice/file)
    ↓
Plugin prepares input (extract text, encode images, save media)
    ↓
Store in session (role: user)
    ↓
PiAgentRuntime.run() — agent executes with full tool access
    ↓
Store response in session
    ↓
Reply delivered via adapter.send()
```

### Configuration

Channel configs stored in `~/.vargos/channels.json`:

```json
[
  {
    "type": "whatsapp",
    "enabled": true
  },
  {
    "type": "telegram",
    "enabled": true,
    "botToken": "123456:ABC...",
    "allowFrom": ["user_id_1"]
  }
]
```

---

## Quick Reference

### Commands

```bash
pnpm dev                               # MCP server (stdio)
pnpm chat                              # Interactive CLI chat
tsx src/cli.ts chat -s <name>          # Named session
tsx src/cli.ts run "<task>"            # One-shot task
tsx src/cli.ts config                  # Interactive config wizard
tsx src/cli.ts config:get              # Show current config
tsx src/cli.ts config:set              # Set LLM provider/model
tsx src/cli.ts onboard                 # Channel setup
tsx src/cli.ts scheduler               # Standalone cron
```

### Environment Variables

```bash
VARGOS_DATA_DIR=~/.vargos        # Root data directory
VARGOS_WORKSPACE=<dir>           # Context files directory
VARGOS_MEMORY_BACKEND=file       # Memory backend (file | qdrant)
VARGOS_SESSIONS_BACKEND=file     # Sessions backend (file | postgres)
VARGOS_TRANSPORT=stdio           # MCP transport (stdio | http)
OPENAI_API_KEY=sk-xxx            # For embeddings + Pi agent
QDRANT_URL=http://...            # Qdrant vector search
POSTGRES_URL=postgresql://...    # PostgreSQL sessions
```

---

*For architecture details, see [CLAUDE.md](../CLAUDE.md). For contribution guidelines, see [CONTRIBUTING.md](../CONTRIBUTING.md).*
