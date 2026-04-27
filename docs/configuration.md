# Configuration

All settings live in a single `config.json` file at `~/.vargos/`.

## Location

Default data directory: `~/.vargos/`. Override:

```bash
# In config.json
{ "paths": { "dataDir": "/your/custom/path" } }

# Or environment variable
export VARGOS_DATA_DIR=/your/custom/path
```

Priority: `config.paths.dataDir` > `VARGOS_DATA_DIR` env > `~/.vargos`

## Full Reference

```jsonc
{
  // Provider definitions — each provider groups its models
  "providers": {
    "openai": {
      "baseUrl": "https://api.openai.com",
      "apiKey": "sk-...",           // or use OPENAI_API_KEY env var
      "models": [
        { "id": "gpt-4o", "name": "GPT-4o" },
        { "id": "whisper-1", "name": "Whisper" }
      ]
    },
    "anthropic": {
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "sk-ant-...",
      "models": [
        { "id": "claude-sonnet-4-20250514", "name": "Claude Sonnet" }
      ]
    },
    "openrouter": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "sk-or-...",
      "models": [
        { "id": "minimax/minimax-m2.7", "name": "Minimax" }
      ]
    },
    "local": {
      "baseUrl": "http://localhost:11434",
      "apiKey": "local",            // required dummy value for Pi SDK
      "models": [
        { "id": "llama3.1", "name": "Llama 3.1" }
      ]
    }
  },

  // Agent configuration — uses "provider:modelId" format
  "agent": {
    "model": "openai:gpt-4o",       // required — default model
    "fallback": "anthropic:claude-sonnet-4-20250514",  // optional
    "media": {                      // optional — media type → model
      "audio": "openai:whisper-1",
      "image": "openai:gpt-4o"
    },
    "subagents": {                  // optional — sub-agent limits
      "maxSpawnDepth": 3,           // max nesting depth (default: 3)
      "runTimeoutSeconds": 300,     // per-subagent timeout (default: 300)
      "maxChildren": 10,            // max active children per parent
      "model": "openai:gpt-4o-mini" // optional — cheaper model for workers
    }
  },

  // Channels — array of channel instances
  "channels": [
    {
      "type": "telegram",
      "id": "tg-bot",
      "botToken": "...",
      "enabled": true,
      "allowFrom": ["123456"],       // optional whitelist
      "model": "anthropic:claude-sonnet-4-20250514",  // optional per-channel model
      "debounceMs": 2000             // optional message debounce
    },
    {
      "type": "whatsapp",
      "id": "wa-personal",
      "enabled": true,
      "allowFrom": ["+1234567890"]
    }
  ],


  // Link expansion for inbound messages
  "linkExpand": {
    "enabled": true,
    "maxUrls": 3,
    "maxCharsPerUrl": 8000,
    "timeoutMs": 5000
  },

  // Gateway (TCP/JSON-RPC)
  "gateway": {
    "host": "127.0.0.1",
    "port": 9000,
    "requestTimeout": 30000
  },

  // MCP server
  "mcp": {
    "transport": "http",
    "host": "127.0.0.1",
    "port": 9001,
    "endpoint": "/mcp",
    "bearerToken": "your-secret"
  },

  // External MCP tool servers
  "mcpServers": {
    "atlassian": {
      "command": "uvx",
      "args": ["mcp-atlassian"],
      "env": { "JIRA_URL": "..." }
    }
  },

  // Webhooks
  "webhooks": [
    {
      "id": "github-pr",
      "name": "GitHub PR",
      "token": "secret-token",
      "transform": "./transforms/github.js",
      "notify": ["telegram:tg-bot:+1234567890"]
    }
  ],

  // Storage
  "storage": {
    "type": "sqlite"   // sqlite | postgres
  },

  // Media
  "media": {
    "audio": "openai:whisper-1",
    "image": "openai:gpt-4o"
  },

  // Paths
  "paths": {
    "dataDir": "~/.vargos",
    "workspace": "~/.vargos/workspace"
  }
}
```

## Providers

Each provider groups its models under one config entry. Model refs throughout the config use `provider:modelId` format (e.g., `openai:gpt-4o`).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `baseUrl` | string | yes | API endpoint |
| `apiKey` | string | yes | API key (overridden by `${PROVIDER}_API_KEY` env var) |
| `api` | string | no | API type (e.g., `openai-completions`) |
| `models` | array | no | Model definitions with `id` and `name` |

## Agent Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | yes | Default model (`provider:modelId`) |
| `fallback` | string | no | Fallback model when primary fails |
| `media.audio` | string | no | Audio transcription model |
| `media.image` | string | no | Image description model |
| `subagents.maxSpawnDepth` | number | no | Max nesting depth (default: 3) |
| `subagents.runTimeoutSeconds` | number | no | Per-subagent timeout (default: 300) |
| `subagents.maxChildren` | number | no | Max active children per parent (default: 10) |
| `subagents.model` | string | no | Model for sub-agents (inherits from parent if unset) |

## Channels

Channels is an **array** of channel instances. Each entry has a unique `id` and a `type`. Multiple entries with the same `type` but different `id` run multiple instances (e.g., two WhatsApp accounts).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique instance name (e.g., `telegram-work`) |
| `type` | string | yes | Platform: `telegram` or `whatsapp` |
| `enabled` | boolean | no | Whether active (default: `true`) |
| `botToken` | string | telegram only | Telegram bot token from @BotFather |
| `allowFrom` | string[] | no | Whitelist of user IDs |
| `model` | string | no | Override `agent.model` for this channel |
| `debounceMs` | number | no | Message debounce delay (default: 2000) |

## API Key Precedence

`${PROVIDER}_API_KEY` env var takes priority over `providers.*.apiKey`. For example, `OPENAI_API_KEY` overrides the config value for the `openai` provider.

## Local Providers

Ollama and LM Studio require a dummy API key (`"local"`) for the Pi SDK auth layer:

```jsonc
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "apiKey": "local",
      "models": [{ "id": "llama3.1", "name": "Llama 3.1" }]
    }
  },
  "agent": { "model": "ollama:llama3.1" }
}
```

## Migration

Legacy config formats are auto-migrated on first load:
- `models` Record → `providers` Record
- `agent.primary` → `agent.model`
- `heartbeat.every` cron → `heartbeat.intervalMinutes`
- `heartbeat.activeHours` object → `[start, end]` tuple + `activeHoursTimezone`

See [getting-started.md](./getting-started.md) for initial setup.

## Cron Tasks

Cron tasks are stored as markdown files in `~/.vargos/cron/` instead of in `config.json`. Each task is a `.md` file with YAML frontmatter containing metadata and a body containing the task prompt.

### File Location

```
~/.vargos/cron/
├── daily-ai-news.md
├── weekly-docs-review.md
└── .templates/
    └── heartbeat.md          # Template for onboarding
```

### File Format

Each task is a markdown file with YAML frontmatter:

```yaml
---
id: daily-ai-news
name: Daily AI Scan
schedule: "0 9 * * *"
enabled: true
activeHours: [8, 22]
activeHoursTimezone: "Australia/Sydney"
notify:
  - whatsapp-vadi-indo:+1234567890
---

Research today's AI news, GitHub trending, and package releases. Synthesize into a report.

Reference workspace files with ${WORKSPACE_DIR} and system paths with ${DATA_DIR}.
```

### Metadata Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier for the task |
| `name` | string | yes | Human-readable task name |
| `schedule` | string | yes | Cron expression (e.g., `"0 9 * * *"` for 9am daily) |
| `task` | string (body) | yes | Task prompt. Supports `${WORKSPACE_DIR}`, `${DATA_DIR}`, etc. |
| `enabled` | boolean | no | Whether the task is active (default: `true`) |
| `activeHours` | array | no | Hour window for conditional execution: `[startHour, endHour]` (0-23). Task only runs during these hours. |
| `activeHoursTimezone` | string | no | IANA timezone for interpreting `activeHours` (e.g., `"Australia/Sydney"`) |
| `notify` | array | no | Channel session keys for result delivery (e.g., `["whatsapp-vadi-indo:+1234567890"]`) |

### Variable Interpolation

Task prompts support variable interpolation, allowing prompts to reference dynamic paths without hardcoding them.

#### Supported Variables

| Variable | Value | Example |
|----------|-------|---------|
| `${WORKSPACE_DIR}` | User's workspace directory | `~/.vargos/workspace` |
| `${DATA_DIR}` | User's data directory (respects `$VARGOS_DATA_DIR`) | `~/.vargos` |
| `${SESSIONS_DIR}` | Session storage directory | `~/.vargos/sessions` |
| `${CACHE_DIR}` | Cache directory | `~/.cache/vargos` |
| `${LOGS_DIR}` | Logs directory | `~/.vargos/logs` |
| `${CHANNELS_DIR}` | Channels storage directory | `~/.vargos/channels` |
| `${HOME}` | User's home directory | `/home/username` |
| `${PWD}` | Current working directory | `/path/to/cwd` |

#### Best Practices

1. **Use workspace for user-editable files**: Place task checklists and configuration at `${WORKSPACE_DIR}` so users can easily find and edit them.
2. **Use data dir for system files**: Reference system data at `${DATA_DIR}` for locations managed by Vargos.
3. **Avoid hardcoding paths**: Don't use `/home/username/...` paths directly. Use variables for portability across machines and users.
4. **Document path assumptions**: In task descriptions, note which files the agent will read.

#### Example: Multi-File Review Task

Create `~/.vargos/cron/weekly-docs-check.md`:

```yaml
---
id: weekly-docs-check
name: Weekly Docs Check
schedule: "0 9 * * 0"
enabled: true
---

Review all .md files in ${WORKSPACE_DIR}/docs/. Check each for:
1. Stale information
2. Broken references
3. Missing context

For each issue, write a note to ${WORKSPACE_DIR}/HEARTBEAT.md under '## Docs Review'.
```

### Ephemeral Tasks

The heartbeat task is an ephemeral task that runs periodically to keep the agent active. It's stored as a template at `.templates/vargos/cron/heartbeat.md` for onboarding flows. To enable heartbeat, copy it to `~/.vargos/cron/heartbeat.md`.

### Creating Tasks

1. Create a new `.md` file in `~/.vargos/cron/`:
   ```bash
   cat > ~/.vargos/cron/my-task.md << 'EOF'
   ---
   id: my-task
   name: My Task
   schedule: "0 9 * * *"
   enabled: true
   ---

   Your task prompt here. Use ${WORKSPACE_DIR} and ${DATA_DIR} for dynamic paths.
   EOF
   ```

2. The task will be loaded on next startup or when the cron service reloads.

### Updating Tasks

Edit the `.md` file directly — metadata in the frontmatter, prompt in the body. The cron service will detect changes on reload.

### Removing Tasks

Delete the `.md` file from `~/.vargos/cron/` to disable a task.
