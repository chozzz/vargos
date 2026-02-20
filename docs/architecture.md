# Architecture

Vargos is a **service-oriented system** where independent services communicate through a single WebSocket gateway.

## Design Principles

1. **Fewer lines, more signal** — every line must earn its place. Delete before extending.
2. **Full RPC + events + streaming** — one gateway protocol handles request/response, pub/sub events, and streaming deltas.
3. **Compaction** — dense, layered abstractions. One concept per module. If two things do similar work, merge them.
4. **Scalable** — services can run in-process or across machines. The WebSocket contract is the only coupling.
5. **Maintainable** — adding a service never requires touching the gateway. Registration is declarative.
6. **Durable** — graceful degradation everywhere. Backpressure over crashes. Reconnect over failure. Persist over memory.
7. **Isolated** — services share nothing. State lives in sessions. Communication goes through the gateway.
8. **Observable** — every frame has an ID. Every event has a sequence number. Trace any message end-to-end.
9. **Protocol-first** — define the contract before writing code. Types are the documentation.
10. **Test at boundaries** — mock the gateway, test each service in isolation. Integration tests use the real protocol.

---

## Directory Structure

```
src/
  # Cross-cutting infrastructure
  lib/           Pure utilities (logger, dedupe, debounce, errors, media, mask, schedule, spinner, editor)
  config/        Config loading, validation, workspace, paths
  protocol/      Wire protocol (frame types, Zod schemas)
  gateway/       WS server, router, event bus, registry, ServiceClient base, methods/events

  # Domain modules (each owns its types, service, implementation)
  agent/         Agent service, Pi runtime, lifecycle, prompt, queue, history
  sessions/      Session service, file-store, types
  channels/      Channel service, delivery, factory, whatsapp/, telegram/
  cron/          Cron service, tasks/heartbeat
  memory/        Memory service, context, sqlite/postgres storage, types
  tools/         Tool service, registry, base, fs/, web/, agent/, memory/
  services/      Shared services (browser, process)

  # Edge layers
  mcp/           MCP-to-gateway RPC bridge (stdio + HTTP)
  cli/           Composition root, interactive menu, config wizards
```

---

## Domain Boundaries

Each domain module owns its types, service client, and implementation. Domains communicate via gateway RPC — never by importing each other directly. ESLint enforces this via `no-restricted-imports`.

```
lib/           → nothing (pure utilities)
config/        → lib/
protocol/      → nothing (wire format only)
gateway/       → protocol/
agent/         → gateway/, config/, lib/, tools/, sessions/ (DI only)
sessions/      → gateway/, config/, lib/
channels/      → gateway/, config/, lib/
cron/          → gateway/, config/, lib/
memory/        → config/, lib/
tools/         → gateway/, config/, lib/, services/
services/      → lib/
mcp/           → gateway/, config/
cli/           → everything (composition root)
```

---

## Topology

```
                        ┌─────────────────────┐
                        │      Gateway         │
                        │                      │
                        │  Service Registry    │
                        │  Method Router       │
                        │  Event Bus (pub/sub) │
                        │  Auth + Scopes       │
                        └──────────┬──────────┘
                                   │ WebSocket
            ┌──────────┬───────────┼───────────┬──────────┐
            ↕          ↕           ↕           ↕          ↕
        ┌───────┐  ┌────────┐  ┌───────┐  ┌───────┐  ┌──────┐
        │ Agent │  │Channel │  │ Tools │  │ Cron  │  │  UI  │
        │Service│  │Service │  │Service│  │Service│  │Client│
        └───────┘  └────────┘  └───────┘  └───────┘  └──────┘
```

The gateway is a **dumb router** — it knows nothing about agents, tools, or channels. It routes frames between services based on a registration table. Adding a service means connecting and registering, nothing else. See [extensions.md](./extensions.md) for tool implementations and channel adapters.

---

## Protocol

Three frame types over WebSocket:

```typescript
// Request: caller → gateway → target service
interface RequestFrame {
  type: "req";
  id: string;           // UUID for response correlation
  target: string;       // service name (e.g., "agent", "tools", "channel")
  method: string;       // e.g., "agent.run", "tool.execute"
  params?: unknown;
}

// Response: target service → gateway → caller
interface ResponseFrame {
  type: "res";
  id: string;           // matches request id
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Event: source service → gateway → all subscribers
interface EventFrame {
  type: "event";
  source: string;       // originating service
  event: string;        // topic (e.g., "run.delta", "message.received")
  payload?: unknown;
  seq?: number;         // global sequence for gap detection
}
```

---

## Service Registration

On connect, each service identifies itself:

```typescript
// Service → Gateway handshake
{
  type: "req",
  method: "gateway.register",
  params: {
    service: "agent",
    version: "1.0.0",
    methods: ["agent.run", "agent.abort", "agent.status"],
    events: ["run.started", "run.delta", "run.completed"],
    subscriptions: ["message.received", "cron.trigger"],
  }
}
```

Gateway responds with the full routing table so services know what's available.

---

## Base Service Client

Every service extends `ServiceClient` (in `gateway/service-client.ts`). It handles the protocol so services only implement their domain logic. Methods and events use typed string literal unions from `gateway/` for compile-time safety:

```typescript
abstract class ServiceClient {
  constructor(config: {
    service: string;
    methods: ServiceMethod[];    // typed string literals from gateway/methods.ts
    events: ServiceEvent[];      // typed string literals from gateway/events.ts
    subscriptions: ServiceEvent[];
    gatewayUrl?: string;
  }) {}

  async call<T>(target: string, method: string, params?: unknown): Promise<T>;
  emit(event: string, payload: unknown): void;

  abstract handleMethod(method: string, params: unknown): Promise<unknown>;
  abstract handleEvent(event: string, payload: unknown): void;
}
```

---

## Services

### Agent Service

Wraps the Pi agent runtime. Handles agent execution, streaming, and subagent spawning. See [runtime.md](./runtime.md) for internals.

| Method | Params | Description |
|--------|--------|-------------|
| `agent.run` | `{ sessionKey, task, model?, images?, channel? }` | Execute agent on session |
| `agent.abort` | `{ sessionKey }` | Cancel running agent |
| `agent.status` | `{ sessionKey }` | Check if agent is running |

**Events emitted:**

| Event | Payload | Description |
|-------|---------|-------------|
| `run.started` | `{ sessionKey, runId }` | Agent execution began |
| `run.delta` | `{ sessionKey, runId, delta, tools?, cost? }` | Streaming text delta |
| `run.completed` | `{ sessionKey, runId, response, success }` | Agent finished |

**Subscribes to:** `message.received`, `cron.trigger`

### Channel Service

Manages external messaging adapters. Each channel type (WhatsApp, Telegram) runs as an adapter within this service.

| Method | Params | Description |
|--------|--------|-------------|
| `channel.send` | `{ channel, userId, text }` | Send message to user |
| `channel.status` | `{ channel? }` | Adapter health |
| `channel.list` | — | List active channels |

**Events emitted:**

| Event | Payload | Description |
|-------|---------|-------------|
| `message.received` | `{ channel, userId, sessionKey, type, content, metadata }` | Inbound message |
| `channel.connected` | `{ channel }` | Adapter connected |
| `channel.disconnected` | `{ channel, reason }` | Adapter lost connection |

### Tools Service

Exposes MCP tools as gateway-callable methods. Also serves MCP clients directly.

| Method | Params | Description |
|--------|--------|-------------|
| `tool.execute` | `{ name, args, context }` | Execute a tool |
| `tool.list` | — | List available tools |
| `tool.describe` | `{ name }` | Get tool schema |

### Sessions Service

Manages session state, history, and lifecycle.

| Method | Params | Description |
|--------|--------|-------------|
| `session.list` | `{ kind?, limit? }` | List sessions |
| `session.history` | `{ sessionKey, limit? }` | Get transcript |
| `session.send` | `{ sessionKey, content }` | Inject message |
| `session.create` | `{ sessionKey, kind, metadata }` | Create session |
| `session.delete` | `{ sessionKey }` | Delete session |

**Events emitted:**

| Event | Payload | Description |
|-------|---------|-------------|
| `session.created` | `{ sessionKey, kind }` | New session |
| `session.message` | `{ sessionKey, role, content }` | Message added |

### Cron Service

Scheduled task execution. Fires events that the agent service subscribes to.

| Method | Params | Description |
|--------|--------|-------------|
| `cron.list` | — | List scheduled tasks |
| `cron.add` | `{ name, schedule, task, description }` | Add task |
| `cron.remove` | `{ id }` | Remove task |
| `cron.run` | `{ id }` | Trigger task immediately |

**Events emitted:**

| Event | Payload | Description |
|-------|---------|-------------|
| `cron.trigger` | `{ taskId, task, sessionKey }` | Task fired |

---

## Gateway Internals

### Router

Maintains a routing table: `method → serviceConnection`. When a request arrives, look up the target service and forward the frame.

### Event Bus

Topic-based pub/sub. Services declare subscriptions at registration. Events are fan-out to all matching subscribers. Each event gets a global sequence number for gap detection.

### Service Health

Gateway pings services periodically. If a service disconnects, its routes and subscriptions are removed. If it reconnects, it re-registers. Callers waiting on a response from a dead service get a timeout error.

---

## Message Flow Examples

### WhatsApp DM → Agent → Reply

```
1. WhatsApp adapter receives DM
2. Channel service emits:
   { type: "event", source: "channel", event: "message.received",
     payload: { channel: "whatsapp", userId: "123", text: "hello", sessionKey: "wa:123" } }

3. Gateway routes to agent service (subscribed to "message.received")

4. Agent service calls tools:
   { type: "req", target: "tools", method: "tool.execute",
     params: { name: "read", args: { path: "/foo" }, context: { sessionKey: "wa:123" } } }

5. Tools service responds:
   { type: "res", id: "...", ok: true, payload: { content: [...] } }

6. Agent streams to UI:
   { type: "event", source: "agent", event: "run.delta",
     payload: { sessionKey: "wa:123", delta: "Based on the file..." } }

7. Agent calls channel to reply:
   { type: "req", target: "channel", method: "channel.send",
     params: { channel: "whatsapp", userId: "123", text: "Here's what I found..." } }
```

### Cron Trigger → Agent Execution

```
1. Cron service fires:
   { type: "event", source: "cron", event: "cron.trigger",
     payload: { taskId: "daily-analysis", task: "Review workspace", sessionKey: "cron:daily" } }

2. Agent service receives, starts execution
3. Agent calls tools as needed via gateway
4. Agent stores result in session via gateway
```

### Browser UI → Live Agent Streaming

```
1. UI connects to gateway, subscribes to ["run.delta", "run.completed"]
2. UI calls: { type: "req", target: "agent", method: "agent.run",
               params: { sessionKey: "chat:main", task: "Explain this code" } }
3. Gateway routes to agent service
4. Agent streams deltas back as events (UI receives them in real-time)
5. Agent completes, UI receives run.completed
```
