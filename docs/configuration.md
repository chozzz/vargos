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
    "fallback": "openai"            // optional
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
    "fallback": "openai"       // optional — used when primary fails
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

## Migration

Legacy config formats are auto-migrated on first load:
- Inline `agent: { provider, model, apiKey }` -> `models` map + `agent: { primary }`
- Flat `workspace/config.json` -> nested `config.json`
- Legacy Pi SDK `settings.json` + `agent/auth.json` -> merged
- Separate `channels.json` -> merged into `channels` section

See [getting-started.md](./getting-started.md) for initial setup.
