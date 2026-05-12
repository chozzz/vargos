# Example: MCP Integration

Vargos is both an MCP **server** (exposes its bus surface to external clients like Claude Desktop) and an MCP **client** (loads external MCP servers and makes their tools available to the agent).

The MCP server (`edge/mcp/`) is currently commented out in [`index.ts`](../../index.ts) — only the client side is active. This example covers both for when the server is re-enabled.

## As an MCP client (active)

Connect external MCP servers; their tools appear to the agent as bus tools, namespaced `mcp.<server>.<tool>`.

Add to `~/.vargos/config.json`:

```jsonc
{
  "mcpServers": {
    "atlassian": {
      "command": "uvx",
      "args": ["mcp-atlassian"],
      "env": {
        "JIRA_URL": "https://mycompany.atlassian.net",
        "JIRA_API_TOKEN": "..."
      }
    }
  }
}
```

The agent sees `mcp.atlassian.jira_create_issue`, etc. Channel personas can whitelist via glob: `allowedTools: ["mcp.atlassian.*"]`.

## As an MCP server (when re-enabled)

External clients connect to Vargos's HTTP MCP endpoint and call any registered bus method. Bearer-token auth.

Once `edge/mcp/` is uncommented in `index.ts`, configure your MCP client to point at `http://127.0.0.1:9001/mcp` with the configured bearer token. For Claude Desktop, use `mcp-remote` as a stdio↔HTTP shim.

## Common use cases

- **Jira / Atlassian** — create issues, search tickets, update status from chat
- **GitHub** — PRs, issues, repo management
- **Databases** — query, migrate via MCP
- **Custom** — any MCP server you build or find

## See also

- [MCP](../usage/mcp.md) — client + server overview
- [Configuration](../configuration.md) — `mcpServers` and `mcp` schemas
