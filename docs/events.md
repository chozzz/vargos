# WebSocket Events Reference

All events flow through the gateway's pub/sub bus. A service emits an event; the gateway fans it out to every service that declared that topic in its `subscriptions` list at registration.

---

## Event Map

```
Emitter          Event                Subscribers
─────────────────────────────────────────────────────────────────
agent            run.started          channel
agent            run.delta            channel, cli-client
agent            run.completed        channel, cron, cli-client
agent            run.tool             cli-client
channel          message.received     agent
cron             cron.trigger         agent
webhook          webhook.trigger      agent
sessions         session.created      (none registered)
sessions         session.message      (none registered)
```

---

## Agent Events

### `run.started`

Emitted when an agent run begins, before the first LLM call.

```typescript
{
  sessionKey: string;  // e.g. "whatsapp-personal:61423222658"
  runId:      string;  // UUID for this run
}
```

**Subscribers:**
- **channel** — starts typing indicator, initialises a `StatusReactionController` (sets 🤔 reaction on the triggering message)

---

### `run.delta`

Emitted for each streaming event from the LLM runtime.

```typescript
{
  sessionKey: string;
  runId:      string;
  type:       'text_delta' | 'tool_start' | 'tool_end';
  data:       string;  // text chunk, or tool name
}
```

`type` values:
| Value | Meaning |
|-------|---------|
| `text_delta` | LLM produced a text chunk |
| `tool_start` | Tool invocation started (`data` = tool name) |
| `tool_end` | Tool invocation finished (`data` = tool name) |

**Subscribers:**
- **channel** — advances the status reaction: `tool_start` → 🔧, `text_delta` → back to 🤔
- **cli-client** — streams text and tool call display to the terminal

---

### `run.completed`

Emitted when an agent run finishes (success or failure).

```typescript
{
  sessionKey: string;
  runId:      string;
  success:    boolean;
  response:   string;  // first 500 chars of the final response
}
```

**Subscribers:**
- **channel** — stops typing indicator, seals the status reaction (✅ or ❗)
- **cron** — releases the concurrency lock for the task so it can fire again
- **cli-client** — signals the terminal that the run is done

---

### `run.tool`

Emitted for every tool invocation — richer detail than `run.delta`.

```typescript
{
  sessionKey: string;
  runId:      string;
  toolName:   string;
  phase:      'start' | 'end';
  args?:      unknown;    // present on phase=start
  result?:    unknown;    // present on phase=end
}
```

**Subscribers:**
- **cli-client** — renders full tool call + result in the terminal

---

## Channel Events

### `message.received`

Emitted when a channel adapter receives an inbound message from a user. Also re-emitted by the channel service on boot for any orphaned messages (user messages with no assistant response after a crash).

```typescript
{
  channel:    string;           // instanceId, e.g. "telegram-bakabit"
  userId:     string;           // normalised sender ID
  sessionKey: string;           // "<channel>:<userId>"
  content:    string;           // message text (URLs already expanded inline)
  metadata?:  {
    messageId?: string;         // platform message ID (used for reactions)
    images?:    MediaImage[];   // present when message contained images
    media?:     MediaInfo;      // present when message contained audio/video
    type?:      string;         // e.g. "task"
  };
}
```

**Subscribers:**
- **agent** — creates/resumes the session and enqueues an agent run

---

### `channel.connected`

Emitted when a channel adapter successfully connects.

```typescript
{ channel: string }  // instanceId
```

**Subscribers:** none registered (informational — visible via `gateway.inspect`)

---

### `channel.disconnected`

Emitted when a channel adapter loses its connection.

```typescript
{ channel: string; reason: string }
```

**Subscribers:** none registered (adapters self-manage reconnect internally)

---

## Cron Events

### `cron.trigger`

Emitted when a scheduled task fires (either on schedule or via `cron.run`).

```typescript
{
  taskId:     string;     // task id from config
  name:       string;     // human-readable task name
  task:       string;     // the prompt/instruction for the agent
  sessionKey: string;     // "cron:<taskId>:<YYYY-MM-DD>"
  notify?:    string[];   // channel targets, e.g. ["whatsapp-personal:61423222658"]
}
```

**Subscribers:**
- **agent** — starts an agent run for the task; stores result and delivers to `notify` targets on completion

---

## Webhook Events

### `webhook.trigger`

Emitted when an inbound HTTP webhook fires after optional transform and HMAC validation.

```typescript
{
  hookId:     string;
  task:       string;     // assembled from transform output or raw body
  sessionKey: string;     // "webhook:<hookId>:<timestamp>"
  notify?:    string[];   // channel targets for result delivery
}
```

**Subscribers:**
- **agent** — starts an agent run; delivers result to `notify` targets on completion

---

## Sessions Events

### `session.created`

Emitted after a new session is persisted.

```typescript
{ sessionKey: string; kind: 'main' | 'cron' | 'subagent' | 'webhook' }
```

**Subscribers:** none (available for future web UI / observability consumers)

---

### `session.message`

Emitted after a message is appended to a session.

```typescript
{ sessionKey: string; role: 'user' | 'assistant' | 'system' }
```

**Subscribers:** none (available for future web UI / observability consumers)

---

## Subscription Summary by Service

| Service | Subscribes to | Why |
|---------|---------------|-----|
| **agent** | `message.received` | Trigger run from inbound channel message |
| **agent** | `cron.trigger` | Trigger run from scheduled task |
| **agent** | `webhook.trigger` | Trigger run from HTTP webhook |
| **channel** | `run.started` | Start typing indicator + init status reaction |
| **channel** | `run.delta` | Advance status reaction phase |
| **channel** | `run.completed` | Stop typing indicator + seal status reaction |
| **cron** | `run.completed` | Release concurrency lock when task run finishes |
| **cli-client** | `run.delta` | Stream output to terminal |
| **cli-client** | `run.completed` | Signal end of run to terminal |
| **cli-client** | `run.tool` | Show tool calls + results in terminal |
| **sessions** | — | No subscriptions (request-driven only) |
| **tools** | — | No subscriptions (request-driven only) |
| **webhooks** | — | No subscriptions (HTTP-driven only) |
| **mcp** | — | No subscriptions (request-driven only) |
