# MCP

Vargos is both an MCP **server** (exposes its 22 tools to external clients) and an MCP **client** (connects to external MCP servers and makes their tools available to the agent). MCP is one integration point — the same tools are also available internally via the gateway protocol.

## Server

## Endpoints

| URL | Description |
|-----|-------------|
| `http://127.0.0.1:9001/mcp` | MCP protocol (Streamable HTTP) |
| `http://127.0.0.1:9001/openapi.json` | OpenAPI 3.1 spec for all tools |

## Claude Desktop

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

## Stdio Mode

For MCP clients that expect stdio transport:

```jsonc
{
  "mcp": { "transport": "stdio" }
}
```

## HTTP Config

```jsonc
{
  "mcp": {
    "transport": "http",         // default
    "host": "127.0.0.1",
    "port": 9001,
    "endpoint": "/mcp"
  }
}
```

## OpenAPI

`GET /openapi.json` returns an OpenAPI 3.1 spec generated from the tool registry. Each tool maps to a `POST /tools/{name}` operation with its JSON Schema input. Useful for documentation, code generation, or REST-based integrations.

## Available Tools (22)

### File System

| Tool | Description |
|------|-------------|
| `read` | Read file contents (5MB limit, image support) |
| `write` | Write/create files |
| `edit` | Precise text replacement |
| `exec` | Shell commands (60s timeout) |

### Web

| Tool | Description |
|------|-------------|
| `web_fetch` | Fetch + extract readable web content |
| `browser` | Browser automation (Playwright) |

### Agent

| Tool | Description |
|------|-------------|
| `sessions_list` | List active sessions |
| `sessions_history` | Get session transcript |
| `sessions_send` | Send message to session |
| `sessions_spawn` | Spawn subagent |
| `sessions_delete` | Delete a session |
| `cron_add` | Add scheduled task |
| `cron_list` | List scheduled tasks |
| `cron_remove` | Remove a scheduled task |
| `cron_update` | Update a scheduled task |
| `cron_run` | Trigger a task immediately |
| `agent_status` | Show active agent runs |
| `channel_status` | Show channel connection status |
| `config_read` | Read current config (keys masked) |
| `process` | Background process management |

### Memory

| Tool | Description |
|------|-------------|
| `memory_search` | Hybrid semantic + text search |
| `memory_get` | Read specific memory files |
| `memory_write` | Write/append to memory files |

See [extensions.md](./extensions.md) for tool implementation details.

## Client

Vargos connects to external MCP servers at gateway boot. Their tools are discovered automatically and available to the agent as `<server>:<tool_name>`.

```jsonc
{
  "mcpServers": {
    "atlassian": {
      "command": "uvx",
      "args": ["mcp-atlassian"],
      "env": {
        "JIRA_URL": "https://mycompany.atlassian.net",
        "JIRA_USERNAME": "you@company.com",
        "JIRA_API_TOKEN": "..."
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "..." }
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

If a server fails to start, the gateway logs a warning and continues — it won't block boot. See [configuration.md](./configuration.md) for the full config reference.
