# API Reference

Complete reference for all bus RPC methods and events.

## RPC Methods (Callable)

### agent.execute

Execute the agent on a task.

```typescript
await bus.call('agent.execute', {
  sessionKey: string;          // Unique session identifier
  task: string;                // Task/prompt for the agent
  images?: string[];           // Optional image paths
  model?: string;              // Override default model
  budget?: number;             // Token budget
})
```

**Returns:** `{ response: string }`

**Errors:**
- InvalidSession — Session key format invalid
- ModelNotFound — Specified model not available
- RateLimited — API quota exceeded
- Timeout — Agent took too long

**Example:**
```javascript
const result = await bus.call('agent.execute', {
  sessionKey: 'user:123',
  task: 'Write a haiku about rivers',
  images: ['/path/to/image.png']
});
console.log(result.response);  // The agent's response
```

### agent.abort

Stop a running agent execution.

```typescript
await bus.call('agent.abort', {
  sessionKey: string;  // Which agent to stop
})
```

**Returns:** `{ aborted: boolean }`

### config.get

Fetch current configuration.

```typescript
const config = await bus.call('config.get', {})
```

**Returns:** `AppConfig` — Full config object

### channel.send

Send a message to a user on a channel.

```typescript
await bus.call('channel.send', {
  sessionKey: string;     // User's session (contains channel + ID)
  text: string;           // Message text (markdown supported)
  reaction?: string;      // Optional emoji reaction
})
```

**Returns:** `{ sent: boolean; messageId?: string }`

### memory.search

Search workspace memory (vector + keyword search).

```typescript
const results = await bus.call('memory.search', {
  query: string;           // Search query
  maxResults?: number;     // Max results (default: 10)
})
```

**Returns:**
```typescript
[{
  id: string;              // Document ID
  path: string;            // File path
  content: string;         // Matched content
  similarity: number;      // 0-1 similarity score
}]
```

### memory.index

Index a document into memory.

```typescript
await bus.call('memory.index', {
  path: string;       // File path
  content: string;    // Content to index
  metadata?: object;  // Optional metadata
})
```

### memory.forget

Remove a document from memory.

```typescript
await bus.call('memory.forget', {
  path: string;  // Which document to forget
})
```

### cron.add

Schedule a task to run on a cron schedule.

```typescript
await bus.call('cron.add', {
  id: string;              // Unique task ID
  schedule: string;        // Cron expression (e.g., "0 9 * * *")
  task: string;            // Task prompt
  enabled?: boolean;       // Default: true
  notify?: string[];       // Channels to notify with results
})
```

### cron.remove

Remove a scheduled task.

```typescript
await bus.call('cron.remove', {
  id: string;  // Task ID to remove
})
```

### webhook.add

Register a webhook endpoint.

```typescript
await bus.call('webhook.add', {
  id: string;              // Unique webhook ID
  name: string;            // Display name
  token: string;           // Auth token
  transform?: string;      // JS transform function
  notify?: string[];       // Channels to notify
})
```

### fs.read

Read file contents.

```typescript
const content = await bus.call('fs.read', {
  path: string;  // File path (relative or absolute)
})
```

**Returns:** `{ text: string; size: number; mimeType: string }`

### fs.write

Write content to a file.

```typescript
await bus.call('fs.write', {
  path: string;     // File path
  content: string;  // Content to write
  mode?: number;    // Unix permissions (default: 0o644)
})
```

### fs.edit

Edit a file (preserves formatting).

```typescript
await bus.call('fs.edit', {
  path: string;        // File path
  oldString: string;   // Exact text to replace
  newString: string;   // Replacement text
})
```

### web.fetch

Fetch URL and extract text.

```typescript
const result = await bus.call('web.fetch', {
  url: string;              // HTTP(S) URL
  maxChars?: number;        // Max content length
  timeout?: number;         // Request timeout ms
  followRedirects?: boolean; // Default: true
})
```

**Returns:** `{ text: string; url: string; statusCode: number }`

---

## Events (Broadcast)

Services emit these events. You can listen with `@on('event.name')`:

### agent.onDelta

Agent streamed a response chunk.

```typescript
@on('agent.onDelta')
handleChunk(payload: {
  sessionKey: string;
  chunk: string;
}): void
```

### agent.onTool

Agent called a tool.

```typescript
@on('agent.onTool')
handleTool(payload: {
  sessionKey: string;
  toolName: string;
  phase: 'start' | 'end';
  args?: Json;           // Tool parameters
  result?: Json;         // Tool result (if phase='end')
}): void
```

### agent.onCompleted

Agent finished execution.

```typescript
@on('agent.onCompleted')
handleComplete(payload: {
  sessionKey: string;
  success: boolean;
  response?: string;
  error?: string;
  tokens: { input: number; output: number };
}): void
```

### channel.onConnected

Channel adapter connected.

```typescript
@on('channel.onConnected')
handleConnect(payload: {
  instanceId: string;  // e.g., "whatsapp-personal"
  type: string;        // "whatsapp" or "telegram"
}): void
```

### channel.onDisconnected

Channel adapter disconnected.

```typescript
@on('channel.onDisconnected')
handleDisconnect(payload: {
  instanceId: string;
  reason?: string;
}): void
```

### log.onLog

Service emitted a log message.

```typescript
@on('log.onLog')
handleLog(payload: {
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  service: string;
  message: string;
  payload?: any;
  timestamp: number;
}): void
```

### config.onChanged

Configuration changed.

```typescript
@on('config.onChanged')
handleConfigChange(payload: {
  section: string;  // e.g., "channels"
  changes: object;
}): void
```

---

## Error Codes

Standard error codes returned from failed calls:

| Code | Meaning |
|------|---------|
| InvalidInput | Parameters failed validation |
| NotFound | Resource doesn't exist |
| Unauthorized | Permission denied |
| RateLimited | API quota exceeded |
| Timeout | Operation took too long |
| ServiceUnavailable | Service is not running |
| InternalError | Unexpected error (check logs) |

---

## Session Key Format

Session keys identify unique conversations:

```
channelId:conversationId[:senderId[:threadId]]
```

Examples:
- `whatsapp-personal:61423222658` — DM from this user
- `telegram-work:G12345:U99876` — Group message from specific user
- `cli:main:main:1234` — CLI conversation with specific thread

---

## See Also

- [Bus Architecture](./architecture/bus-design.md) — How the bus works
- [Tools Development](./extending/tools.md) — Building custom tools
- [Deployment](./deployment.md) — Production API usage
