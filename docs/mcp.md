# MCP and Tools

Vargos is both an MCP **server** (exposes its 25 tools to external clients) and an MCP **client** (connects to external MCP servers and makes their tools available to the agent). Tools are the core extension point; channel adapters and storage backends are wired at boot.

## Architecture

Each tool implements a standard contract:

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (args: unknown, context: ToolContext) => Promise<ToolResult>;
}

interface ToolContext {
  sessionKey: string;
  workingDir: string;
  env?: Record<string, string>;
  abortSignal?: AbortSignal;
  call?: <T>(target: string, method: string, params?: unknown) => Promise<T>;
}

interface ToolResult {
  content: ToolContent[];   // TextContent | ImageContent
  isError?: boolean;
  metadata?: Record<string, unknown>;
}
```

The `BaseTool` abstract class wraps `execute()` with Zod parameter validation and `beforeExecute`/`afterExecute` hooks. Subclasses implement `executeImpl()`. Helper factories: `textResult()`, `errorResult()`, `imageResult()`.

Extensions register tools via the `VargosExtension` interface:

```typescript
interface VargosExtension {
  id: string;
  name: string;
  register(ctx: ExtensionContext): void | Promise<void>;
}

interface ExtensionContext {
  registerTool(tool: Tool): void;
  paths: { dataDir: string; workspaceDir: string };
}
```

Tools are registered into a singleton `ToolRegistry` during boot:

```typescript
class ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
  has(name: string): boolean;
}
```

## Server

### Endpoints

| URL | Description |
|-----|-------------|
| `http://127.0.0.1:9001/mcp` | MCP protocol (Streamable HTTP) |
| `http://127.0.0.1:9001/openapi.json` | OpenAPI 3.1 spec for all tools |

### Claude Desktop

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

### Stdio Mode

For MCP clients that expect stdio transport:

```jsonc
{
  "mcp": { "transport": "stdio" }
}
```

### HTTP Config

```jsonc
{
  "mcp": {
    "transport": "http",         // default
    "host": "127.0.0.1",
    "port": 9001,
    "endpoint": "/mcp",
    "bearerToken": "your-secret-token"  // required — server won't start without this
  }
}
```

See [configuration.md](./configuration.md#mcp) for full config reference. If `bearerToken` is not set, the HTTP server is skipped at boot.

### OpenAPI

`GET /openapi.json` returns an OpenAPI 3.1 spec generated from the tool registry. Each tool maps to a `POST /tools/{name}` operation with its JSON Schema input. Useful for documentation, code generation, or REST-based integrations.

## Available Tools

### File System

| Tool | Description |
|------|-------------|
| `read` | Read file contents; text and images; `offset`/`limit` for large files (5MB limit) |
| `write` | Create or overwrite files; auto-creates parent directories |
| `edit` | Find-and-replace; requires exact match of `oldText` (single occurrence) |
| `exec` | Shell command execution via `bash -c`; 60s timeout; blocks dangerous patterns |

### Web

| Tool | Description |
|------|-------------|
| `web_fetch` | Fetch URL, convert HTML to markdown; truncates at 50k chars |
| `browser` | Playwright browser automation — navigate, click, type, screenshot, evaluate JS |

### Agent

| Tool | Description |
|------|-------------|
| `sessions_list` | List sessions with optional kind filter |
| `sessions_history` | Full message history for a session |
| `sessions_send` | Post a message into another session |
| `sessions_spawn` | Spawn background subagent with optional role/persona |
| `sessions_delete` | Delete a session and its message history |
| `cron_add` | Schedule recurring task via cron expression |
| `cron_list` | List all scheduled cron tasks |
| `cron_remove` | Remove a scheduled recurring task |
| `cron_update` | Update a scheduled cron task |
| `cron_run` | Trigger immediate execution of a scheduled task |
| `agent_status` | Show currently active agent runs |
| `channel_status` | Show connection status of messaging channels |
| `channel_send_media` | Send media file (image, audio, video, document) to a channel |
| `config_read` | Read current config (API keys masked) |
| `process` | Manage background processes (list, poll, write stdin, kill) |

### Memory

| Tool | Description |
|------|-------------|
| `memory_search` | Hybrid vector + text search over memory files and session transcripts |
| `memory_get` | Read specific lines from a memory file |
| `memory_write` | Write or append to a memory file (auto-indexed for search) |

## Channel Adapters

Channel adapters implement `ChannelAdapter` and live in `channels/whatsapp/` and `channels/telegram/`:

```typescript
interface ChannelAdapter {
  readonly type: ChannelType;   // 'whatsapp' | 'telegram'
  status: ChannelStatus;
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(recipientId: string, text: string): Promise<void>;
}
```

Adapters are wired directly in `cli/gateway/start.ts` via the channel factory. Both share patterns: 2s message debounce (configurable via `debounceMs`), 120s dedup cache, text + media support, private messages only.

## Storage Backends

Storage backends live in their domain directories:

- **FileSessionService** (`sessions/file-store.ts`) — JSONL files in `~/.vargos/sessions/`, one per session

Memory search uses `MemoryContext` (`memory/context.ts`) for hybrid scoring: vector similarity (0.7 weight) + text matching (0.3 weight). Optional embedding providers: OpenAI `text-embedding-3-small` or character trigram fallback.

## Client

Vargos connects to external MCP servers at gateway boot. Their tools are discovered automatically and available to the agent as `<server>:<tool_name>`.

See [configuration.md](./configuration.md#mcp) for the full `mcpServers` config schema and examples.
| `enabled` | boolean | no | Whether to connect (default: `true`) |

If a server fails to start, the gateway logs a warning and continues — it won't block boot. See [configuration.md](./configuration.md) for the full config reference.
