# MCP

Vargos has two sides to MCP:

- **MCP client** — connects to external MCP servers and exposes their tools to the agent as bus tools. Implementation: [`services/mcp-client/`](../../services/mcp-client/). **Active.**
- **MCP server** — exposes Vargos's own bus surface as MCP tools to external clients (Claude Desktop, etc.). Implementation: [`edge/mcp/`](../../edge/mcp/). **Currently commented out in [`index.ts`](../../index.ts).**

## Client (active)

External MCP servers are configured in `~/.vargos/agent/mcp.json` (shared with Pi SDK). This file is seeded with examples on first run.

At boot, [`services/mcp-client/`](../../services/mcp-client/) spawns each server, lists its tools, and registers them on the bus namespaced as `mcp.<server>.<tool>`. The agent calls them like any other bus tool. Channel persona `allowedTools` globs apply (e.g. `mcp.atlassian.*`).

If a server fails to start, the gateway logs a warning and continues — it won't block boot.

### Configuration

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-package"],
      "env": { "API_KEY": "${API_KEY}" },
      "enabled": true
    }
  }
}
```

Each server entry supports:
- `command` — executable name (e.g., `npx`, `node`, `python`)
- `args` — array of arguments (optional, or space-separated in `command`)
- `env` — environment variables to pass (optional; merges with process.env)
- `enabled` — set to `false` to skip a server (optional; defaults to `true`)

Configuration schema reference: [`services/config/index.ts`](../../services/config/index.ts) (`mcpServers` field).

## Server (disabled at boot)

When re-enabled, the MCP server exposes Vargos's `EventMap` over HTTP/MCP at `127.0.0.1:9001/mcp` (port and endpoint configurable via the `mcp` config block). Auth uses a bearer token; without it the server doesn't start.

External clients can configure Vargos as an MCP server, e.g. Claude Desktop via `mcp-remote` pointing at the HTTP endpoint. See [examples/mcp-integration.md](../examples/mcp-integration.md) when the edge service is re-enabled.

## See also

- [Configuration](../configuration.md) — `mcpServers` and `mcp` schemas
- [API Reference](../api-reference.md) — what the MCP server would expose
- [Tools](../extending/tools.md) — how bus methods become tools
