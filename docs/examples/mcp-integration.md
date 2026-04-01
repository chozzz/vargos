# Example: MCP Integration

Vargos is both an MCP **server** (exposes its 25 tools to external clients like Claude Desktop) and an MCP **client** (connects to external MCP servers and makes their tools available to the agent).

## As an MCP Server

Any MCP client can connect to Vargos and call its built-in tools — filesystem, web search, session management, agent spawning, memory, etc.

**Claude Desktop config:**
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

Auth via bearer token (`config.mcp.bearerToken`). HTTP on port 9001 or stdio transport.

## As an MCP Client

Connect to external MCP servers and their tools appear in the agent's tool list automatically.

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

The agent sees external MCP tools as `<server>:<tool_name>` — e.g., `atlassian:jira_create_issue`.

## Use Cases

- **Jira integration**: Create issues, search tickets, update status from agent conversations
- **GitHub tools**: Create PRs, search issues, manage repositories
- **Database tools**: Query databases, run migrations via MCP
- **Custom tools**: Any MCP server you build or find

See [mcp.md](../mcp.md) for transport options and [configuration.md](../configuration.md) for full config reference.
