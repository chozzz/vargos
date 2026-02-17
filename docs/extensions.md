# Extensions

Extensions register tools, channel adapters, services, and cron tasks into the Vargos runtime.

## Architecture

Each extension implements `VargosExtension`:

```typescript
interface VargosExtension {
  id: string;
  name: string;
  register(ctx: ExtensionContext): void | Promise<void>;
}
```

The `ExtensionContext` provides registration methods:

```typescript
interface ExtensionContext {
  registerTool(tool: Tool): void;
  registerChannel(type: string, factory: ChannelFactory): void;
  registerMemoryService(factory: MemoryServiceFactory): void;
  registerSessionService(factory: SessionServiceFactory): void;
  registerCronTask(task: Omit<CronTask, 'id'>): void;
  getServices(): { memory: IMemoryService; sessions: ISessionService };
  paths: { dataDir: string; workspaceDir: string };
}
```

## Tool Interface

Tools follow a standard contract:

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

The `BaseTool` abstract class wraps `execute()` with Zod parameter validation and `beforeExecute`/`afterExecute` hooks. Subclasses implement `executeImpl()`.

Helper factories: `textResult()`, `errorResult()`, `imageResult()`.

## Tool Categories

### File System (`tools-fs`)

| Tool | Description |
|------|-------------|
| `read` | Read file contents; text and images; `offset`/`limit` for large files (5MB limit) |
| `write` | Create or overwrite files; auto-creates parent directories |
| `edit` | Find-and-replace; requires exact match of `oldText` (single occurrence) |
| `exec` | Shell command execution via `bash -c`; 60s timeout; blocks dangerous patterns |

### Agent (`tools-agent`)

| Tool | Description |
|------|-------------|
| `sessions_list` | List sessions with optional kind filter |
| `sessions_history` | Full message history for a session |
| `sessions_send` | Post a message into another session |
| `sessions_spawn` | Spawn background subagent in isolated session |
| `cron_add` | Schedule recurring task via cron expression |
| `cron_list` | List all scheduled cron tasks |
| `process` | Manage background processes (list, poll, write stdin, kill) |

### Memory (`tools-memory`)

| Tool | Description |
|------|-------------|
| `memory_search` | Hybrid vector + text search over memory files and session transcripts |
| `memory_get` | Read specific lines from a memory file |

### Web (`tools-web`)

| Tool | Description |
|------|-------------|
| `web_fetch` | Fetch URL, convert HTML to markdown; truncates at 50k chars |
| `browser` | Playwright browser automation — navigate, click, type, screenshot, evaluate JS |

## Tool Registry

Tools are registered into a singleton `ToolRegistry` during boot:

```typescript
class ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
  has(name: string): boolean;
}
```

## Channel Adapters

Channel adapters implement `ChannelAdapter`:

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

Registered via `ctx.registerChannel(type, factory)`. The factory receives `ChannelConfig` and returns an adapter instance.

Both adapters share patterns: 1.5s message debounce, 120s dedup cache, text + media support, private messages only.

## File Storage

The `service-file` extension provides file-based implementations:

- **FileSessionService** — JSONL files in `~/.vargos/sessions/`, one per session
- **FileMemoryService** — markdown files with term-frequency search

Memory search uses `MemoryContext` for hybrid scoring: vector similarity (0.7 weight) + text matching (0.3 weight). Optional embedding providers: OpenAI `text-embedding-3-small` or character trigram fallback.

See [architecture.md](./architecture.md) for protocol details, [runtime.md](./runtime.md) for agent execution.
