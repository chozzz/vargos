# MCP Server

When the gateway starts, it exposes tools via MCP protocol. HTTP transport is the default.

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

## Available Tools

| Tool | Description |
|------|-------------|
| `read` | Read file contents (5MB limit, image support) |
| `write` | Write/create files |
| `edit` | Precise text replacement |
| `exec` | Shell commands (60s timeout) |
| `process` | Background process management |
| `web_fetch` | Fetch + extract readable web content |
| `browser` | Browser automation (Playwright) |
| `memory_search` | Hybrid semantic + text search |
| `memory_get` | Read specific memory files |
| `sessions_list` | List active sessions |
| `sessions_history` | Get session transcript |
| `sessions_send` | Send message to session |
| `sessions_spawn` | Spawn subagent |
| `cron_add` | Add scheduled task |
| `cron_list` | List scheduled tasks |

See [extensions.md](./extensions.md) for tool implementation details.
