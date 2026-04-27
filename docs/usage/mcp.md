# MCP and Tools

Vargos is both an MCP **server** (exposes its tools to external clients) and an MCP **client** (connects to external MCP servers and makes their tools available to the agent). Tools are the core extension point; channel adapters and storage backends are wired at boot.

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
      "command": "npx",
      "args": ["--yes", "mcp-remote", "http://127.0.0.1:9001/mcp"],
      "env": {
        "MCP_REMOTE_TOKEN": "your-secret-token"
      }
    }
  }
}
```

Alternatively, configure the MCP server directly as an HTTP endpoint in your client. See [mcp-integration.md](./examples/mcp-integration.md) for details.

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
| `fs.read` | Read file contents; text and images; `offset`/`limit` for large files |
| `fs.write` | Create or overwrite files; auto-creates parent directories |
| `fs.edit` | Find-and-replace; requires exact match of `oldText` (single occurrence) |
| `fs.exec` | Shell command execution via `bash -c`; 60s default timeout |

### Web

| Tool | Description |
|------|-------------|
| `web.fetch` | Fetch URL, convert HTML to markdown; truncates at 50k chars |

### Agent

| Tool | Description |
|------|-------------|
| `agent.execute` | Delegate work to a subagent with configurable model, timeout, and working directory |
| `agent.status` | Show currently active agent session keys |
| `config.get` | Read current application configuration |
| `config.set` | Update application config (routes to correct config file) |
| `channel.send` | Send a text message to a channel recipient |
| `channel.sendMedia` | Send media (image, audio, video, document) to a channel recipient |
| `cron.add` | Add a new scheduled cron task |
| `cron.search` | Search scheduled cron tasks |
| `cron.remove` | Remove a scheduled cron task |
| `cron.update` | Update a scheduled cron task |
| `cron.run` | Trigger immediate execution of a scheduled task |

### Memory

| Tool | Description |
|------|-------------|
| `memory.search` | Semantic search over MEMORY.md + memory/*.md files |
| `memory.read` | Read a specific file from the workspace memory directory |
| `memory.write` | Write or append to a memory file (auto-indexed for search) |
| `memory.stats` | Get memory index stats (file count, chunk count, last sync) |

### Media

| Tool | Description |
|------|-------------|
| `media.transcribeAudio` | Transcribe audio file to text using configured audio model |
| `media.describeImage` | Describe an image using configured vision model |

### Channels

| Tool | Description |
|------|-------------|
| `channel.search` | List connected channel adapters |
| `channel.register` | Dynamically register a new channel adapter |
| `channel.get` | Get status of a specific channel adapter |

### Logs

| Tool | Description |
|------|-------------|
| `log.search` | Search persisted log entries by level and/or service |

### Bus Meta-Tools

| Tool | Description |
|------|-------------|
| `bus.search` | Search all callable bus events by name substring |
| `bus.inspect` | Get detailed metadata for a specific bus event |

### Subagent Pattern

Subagent spawning is achieved through `agent.execute` — pass a `task`, optional `model` for model selection, `timeoutMs`, and `cwd`. The spawned subagent returns its own `sessionKey` which can be used for follow-up communication. This replaces the legacy `sessions_spawn`/`sessions_delete` pattern.

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

If a server fails to start, the gateway logs a warning and continues — it won't block boot. See [configuration.md](./configuration.md) for the full config reference.
