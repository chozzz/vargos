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
  // Named model profiles — define one or more
  "models": {
    "anthropic": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "apiKey": "sk-...",           // or use ANTHROPIC_API_KEY env var
      "maxTokens": 16384,           // optional
      "contextWindow": 200000       // optional
    },
    "openai": {
      "provider": "openai",
      "model": "gpt-4o",
      "apiKey": "sk-..."
    },
    "local": {
      "provider": "ollama",
      "model": "llama3.1",
      "apiKey": "local",            // required dummy value for Pi SDK
      "baseUrl": "http://localhost:11434"
    }
  },

  // Which profiles the agent uses
  "agent": {
    "primary": "anthropic",         // key from models map
    "fallback": "openai",           // optional
    "media": {                      // optional — media type → model profile
      "audio": "whisper",
      "image": "vision"
    }
  },

  // Optional — all fields have sensible defaults
  "gateway": {
    "port": 9000,                   // default: 9000
    "host": "127.0.0.1"            // default: 127.0.0.1
  },
  "mcp": {
    "transport": "http",            // http | stdio, default: http
    "host": "127.0.0.1",           // default: 127.0.0.1
    "port": 9001,                   // default: 9001
    "endpoint": "/mcp"              // default: /mcp
  },
  "paths": {
    "dataDir": "~/.vargos",         // default: ~/.vargos
    "workspace": "~/.vargos/workspace"
  },
  "storage": {
    "type": "postgres",             // postgres | sqlite, default: postgres
    "url": "postgresql://..."       // required when type=postgres
  },
  "heartbeat": {
    "enabled": false,               // default: false
    "every": "*/30 * * * *",        // cron expression
    "activeHours": {
      "start": "09:00",            // HH:MM
      "end": "22:00",
      "timezone": "Australia/Sydney"
    },
    "prompt": "..."                 // optional custom prompt
  },
  "cron": {
    "tasks": [                      // user-defined scheduled tasks
      {
        "name": "daily-report",
        "schedule": "0 9 * * *",   // cron expression
        "task": "Generate a summary of recent changes",
        "enabled": true,            // default: true
        "notify": ["whatsapp:614..."]  // optional — channel targets
      }
    ]
  },
  "mcpServers": {                   // external MCP tool servers
    "atlassian": {
      "command": "uvx",
      "args": ["mcp-atlassian"],
      "env": { "JIRA_URL": "...", "JIRA_USERNAME": "...", "JIRA_API_TOKEN": "..." }
    }
  },
  "webhooks": { ... },              // see below
  "compaction": { ... },            // see below
  "channels": { ... }              // see channels.md
}
```

## Model Profiles

Each entry in `models` is a `ModelProfile`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | string | yes | `anthropic`, `openai`, `google`, `openrouter`, `ollama`, `lmstudio`, `groq`, `together`, `deepseek`, `mistral`, `fireworks`, `perplexity` |
| `model` | string | yes | Model identifier (e.g. `claude-sonnet-4-20250514`) |
| `apiKey` | string | no | API key (overridden by env var) |
| `baseUrl` | string | no | Custom API endpoint |
| `maxTokens` | number | no | Max output tokens per response |
| `contextWindow` | number | no | Context window size |

## Agent Reference

The `agent` field points into the `models` map:

```jsonc
{
  "agent": {
    "primary": "anthropic",    // required — default model profile
    "fallback": "openai",      // optional — used when primary fails
    "media": {                 // optional — media preprocessing
      "audio": "whisper",
      "image": "vision"
    }
  }
}
```

## Media Processing

When media arrives on a channel, the primary model may not support it. The `agent.media` map routes each media type to a dedicated model profile for preprocessing:

| Media type | Supported providers | What happens |
|-----------|-------------------|--------------|
| `audio` | `openai` (Whisper) | Transcribed to text, replaces message content |
| `image` | `openai`, `anthropic` | Description prepended to message content |

Omitted types: images fall through to the primary model as-is (may support vision natively), other types get a "not configured" error sent back to the user.

Example config with Whisper + Vision:

```jsonc
{
  "models": {
    "kimi": { "provider": "openrouter", "model": "moonshotai/kimi-k2.5" },
    "whisper": { "provider": "openai", "model": "whisper-1", "apiKey": "sk-..." },
    "vision": { "provider": "openai", "model": "gpt-4o-mini", "apiKey": "sk-..." }
  },
  "agent": {
    "primary": "kimi",
    "media": {
      "audio": "whisper",
      "image": "vision"
    }
  }
}
```

## Cron Tasks

User-defined scheduled tasks are persisted in `config.json` and loaded at gateway boot. Tasks added via `vargos cron add` or the `cron_add` agent tool are automatically saved.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Human-readable task name |
| `schedule` | string | yes | Cron expression (e.g. `0 */6 * * *`) |
| `task` | string | yes | Prompt/description for the agent |
| `enabled` | boolean | no | Whether active (default: `true`) |
| `notify` | string[] | no | Channel targets to deliver results (e.g. `["whatsapp:614..."]`) |

Built-in tasks (vargos analysis, heartbeat) are not stored in config — they're registered at boot.

## External MCP Servers

Connect to external MCP tool servers (Atlassian, GitHub, etc.). Servers are spawned at gateway boot, their tools are discovered automatically and available to the agent as `<server>:<tool_name>`.

```jsonc
{
  "mcpServers": {
    "atlassian": {
      "command": "uvx",
      "args": ["mcp-atlassian"],
      "env": {
        "JIRA_URL": "https://mycompany.atlassian.net",
        "JIRA_USERNAME": "you@company.com",
        "JIRA_API_TOKEN": "...",
        "CONFLUENCE_URL": "https://mycompany.atlassian.net/wiki",
        "CONFLUENCE_USERNAME": "you@company.com",
        "CONFLUENCE_API_TOKEN": "..."
      }
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | yes | Executable to spawn (e.g. `uvx`, `npx`) |
| `args` | string[] | no | Command arguments |
| `env` | object | no | Environment variables passed to the process |
| `enabled` | boolean | no | Whether to connect (default: `true`) |

If a server fails to start, the gateway logs a warning and continues — it won't block boot.

## API Key Precedence

`${PROVIDER}_API_KEY` env var takes priority over `models.*.apiKey`. For example, `ANTHROPIC_API_KEY` overrides the config value when `provider` is `anthropic`.

## Local Providers

Ollama and LM Studio require a dummy API key (`"local"`) for the Pi SDK auth layer:

```jsonc
{
  "models": {
    "ollama": {
      "provider": "ollama",
      "model": "llama3.1",
      "apiKey": "local",
      "baseUrl": "http://localhost:11434"
    }
  }
}
```

## CLI Config Commands

```bash
vargos config llm show           # Display current LLM config
vargos config llm edit           # Change provider/model/key
vargos config channel show       # Display channel config
vargos config channel edit       # Open config in $EDITOR
vargos config context show       # List context files
vargos config context edit       # Edit context in $EDITOR
vargos config heartbeat show     # Display heartbeat config
vargos config heartbeat edit     # Configure heartbeat schedule
```

## Webhooks

Inbound HTTP triggers that fire agent tasks. See [webhooks.md](./webhooks.md) for full details.

```jsonc
{
  "webhooks": {
    "port": 9002,                    // default: 9002
    "host": "127.0.0.1",            // default: 127.0.0.1
    "hooks": [
      {
        "id": "github-pr",          // URL-safe identifier
        "token": "secret-token",    // Bearer token for auth
        "description": "GitHub PR webhooks",
        "transform": "./transforms/github.js",  // optional custom transform
        "notify": ["whatsapp:614..."]            // optional channel targets
      }
    ]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `port` | number | no | HTTP server port (default: `9002`) |
| `host` | string | no | Bind address (default: `127.0.0.1`) |
| `hooks` | array | yes | Hook definitions |
| `hooks[].id` | string | yes | URL-safe identifier (`[a-z0-9_-]+`) |
| `hooks[].token` | string | yes | Bearer token for authentication |
| `hooks[].transform` | string | no | Module path for custom payload transform |
| `hooks[].notify` | string[] | no | Channel targets for result delivery |
| `hooks[].description` | string | no | Human-readable description |

## Compaction

Controls how the agent manages context window usage. Two independent systems:

```jsonc
{
  "compaction": {
    "contextPruning": {
      "enabled": true,               // default: true
      "keepLastAssistants": 3,       // always keep N recent assistant messages
      "softTrimRatio": 0.3,          // trigger soft trim at 30% of context window
      "hardClearRatio": 0.5,         // trigger hard clear at 50%
      "softTrim": {
        "maxChars": 4000,            // max chars per old message
        "headChars": 1500,           // chars from start when truncating
        "tailChars": 1500            // chars from end when truncating
      },
      "tools": {
        "allow": ["read", "edit"],   // only keep these tool calls
        "deny": ["exec"]             // strip these tool calls
      }
    },
    "safeguard": {
      "enabled": true,               // default: true
      "maxHistoryShare": 0.5         // max ratio of context window for history
    }
  }
}
```

**Context pruning** trims old messages to free context space. Soft trim truncates long messages; hard clear removes old messages entirely. Recent assistant messages are always preserved.

**Safeguard** caps the total history size relative to the context window, ensuring the system prompt always fits.

## Migration

Legacy config formats are auto-migrated on first load:
- Inline `agent: { provider, model, apiKey }` -> `models` map + `agent: { primary }`
- Flat `workspace/config.json` -> nested `config.json`
- Legacy Pi SDK `settings.json` + `agent/auth.json` -> merged
- Separate `channels.json` -> merged into `channels` section

See [getting-started.md](./getting-started.md) for initial setup.
