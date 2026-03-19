# Use Case: MCP Integration

## Summary

Vargos is both an MCP **server** (exposes its 25 tools to external clients like Claude Desktop) and an MCP **client** (connects to external MCP servers and makes their tools available to the agent). This lets you extend the agent with any MCP-compatible tool server without touching Vargos code.

## As an MCP Server

Any MCP client (Claude Desktop, Cursor, custom apps) can connect to Vargos and call its built-in tools — filesystem, web search, session management, agent spawning, memory, etc.

```
Claude Desktop → MCP (HTTP/stdio) → Vargos MCP Bridge → ToolsService → execute
```

Auth via bearer token (`config.mcp.bearerToken`). HTTP on port 9001 or stdio transport.

## As an MCP Client

Point Vargos at an external MCP server and its tools appear in the agent's tool list automatically.

```json
{
  "mcp": {
    "servers": [
      { "name": "my-tools", "transport": "http", "url": "http://localhost:8080" }
    ]
  }
}
```

The agent sees external MCP tools alongside built-in tools — no distinction from the agent's perspective.

## Planned: WebRTC Transport

MCP clients will be able to connect over a WebRTC DataChannel, enabling real-time bidirectional tool calls with lower latency than HTTP round-trips and without requiring a fixed port to be open. See `plans/webrtc-gateway.md`.

## Notes

- MCP bridge skipped at boot if `config.mcp.bearerToken` is not set
- External tool results are streamed back as MCP content blocks
- Same domain isolation rules apply — MCP tools go through `ToolsService`, not direct execution
