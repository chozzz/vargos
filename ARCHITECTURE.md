# Architecture

Vargos is evolving from a monolithic MCP server into a **service-oriented system** where independent services communicate through a single WebSocket gateway. This document is the north star for that migration.

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

## Current State

```
src/
├── index.ts              # MCP server entry
├── cli.ts                # CLI entry
├── boot.ts               # Boot + extension loading
├── core/                 # Framework: interfaces, registries, runtime
└── extensions/           # Implementations: tools, channels, services, cron
```

- MCP server exposes 15 tools via stdio/HTTP
- Channel adapters (WhatsApp, Telegram) route messages through a gateway class to the agent
- Gateway is an in-process input normalizer + agent dispatcher
- Tool registry populated by 4 extension modules at boot
- Extension system: `VargosExtension` interface with `register(ctx)` pattern

---

## Target Architecture

### Topology

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

The gateway is a **dumb router** — it knows nothing about agents, tools, or channels. It routes frames between services based on a registration table. Adding a service means connecting and registering, nothing else.

### Protocol

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

### Service Registration

On connect, each service identifies itself:

```typescript
// Service → Gateway handshake
{
  type: "req",
  method: "gateway.register",
  params: {
    service: "agent",
    version: "1.0.0",
    methods: [                    // methods this service handles
      "agent.run",
      "agent.abort",
      "agent.status"
    ],
    events: [                     // events this service emits
      "run.started",
      "run.delta",
      "run.completed"
    ],
    subscriptions: [              // events this service wants to receive
      "message.received",
      "cron.trigger"
    ],
  }
}
```

Gateway responds with the full routing table so services know what's available:

```typescript
{
  type: "res",
  id: "...",
  ok: true,
  payload: {
    services: ["agent", "tools", "channel", "cron", "sessions"],
    methods: ["agent.run", "tool.execute", "channel.send", ...],
    events: ["run.delta", "message.received", ...]
  }
}
```

### Base Service Client

Every service extends this. It handles the protocol so services only implement their domain logic:

```typescript
abstract class ServiceClient {
  private ws: WebSocket;
  private pending = new Map<string, { resolve, reject, timeout }>();

  constructor(private config: {
    service: string;
    methods: string[];
    events: string[];
    subscriptions: string[];
    gatewayUrl?: string;
  }) {}

  // Call another service through the gateway
  async call<T>(target: string, method: string, params?: unknown): Promise<T>;

  // Emit event to all subscribers
  emit(event: string, payload: unknown): void;

  // Subclass implements these
  abstract handleMethod(method: string, params: unknown): Promise<unknown>;
  abstract handleEvent(event: string, payload: unknown): void;
}
```

---

## Services

### Agent Service

Wraps the Pi agent runtime. Handles agent execution, streaming, and subagent spawning.

**Methods:**
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

**Methods:**
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

Exposes the 15 MCP tools as gateway-callable methods. Also serves MCP clients directly.

**Methods:**
| Method | Params | Description |
|--------|--------|-------------|
| `tool.execute` | `{ name, args, context }` | Execute a tool |
| `tool.list` | — | List available tools |
| `tool.describe` | `{ name }` | Get tool schema |

**Events emitted:** None (tools are synchronous request/response).

### Sessions Service

Manages session state, history, and lifecycle.

**Methods:**
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

**Methods:**
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

### UI Client (Browser)

Not a service — a consumer. Connects to gateway, subscribes to events, calls methods.

**Subscribes to:** `run.delta`, `run.completed`, `session.message`, `channel.connected`

**Calls:** `agent.run`, `agent.abort`, `session.list`, `session.history`, `tool.list`

---

## Gateway Internals

### Router

Maintains a routing table: `method → serviceConnection`. When a request arrives, look up the target service and forward the frame. If no handler is registered, respond with error immediately.

```typescript
class Router {
  private routes = new Map<string, WebSocket>();  // method → connection

  register(service: string, methods: string[], conn: WebSocket): void;
  route(frame: RequestFrame): WebSocket | null;
  unregister(conn: WebSocket): void;  // remove all routes for this connection
}
```

### Event Bus

Topic-based pub/sub. Services declare subscriptions at registration. Events are fan-out to all matching subscribers.

```typescript
class EventBus {
  private subscriptions = new Map<string, Set<WebSocket>>();  // event → connections
  private seq = 0;

  subscribe(event: string, conn: WebSocket): void;
  unsubscribe(conn: WebSocket): void;  // remove from all topics
  publish(source: string, event: string, payload: unknown): void;
}
```

### Auth

Challenge-response on connect. Services authenticate with tokens. Scopes control which methods/events are accessible.

### Backpressure

Monitor `ws.bufferedAmount` per connection. If a connection falls behind:
1. Drop non-critical events (`dropIfSlow` flag)
2. If still behind, close with code 1008

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

---

## Target Directory Structure

```
src/
├── gateway/
│   ├── server.ts                # WS server, connection lifecycle
│   ├── router.ts                # method → service routing
│   ├── registry.ts              # service registration + discovery
│   ├── bus.ts                   # event pub/sub with topic filtering
│   ├── auth.ts                  # challenge-response, scopes
│   ├── protocol.ts              # frame types, serialize/deserialize
│   └── backpressure.ts          # slow consumer detection
│
├── services/
│   ├── client.ts                # base ServiceClient class
│   │
│   ├── agent/
│   │   ├── index.ts             # registers: agent.run, agent.abort, agent.status
│   │   ├── runner.ts            # Pi agent execution
│   │   └── streaming.ts         # emits: run.delta events
│   │
│   ├── channels/
│   │   ├── index.ts             # registers: channel.send, channel.status
│   │   ├── whatsapp.ts          # WhatsApp adapter
│   │   └── telegram.ts          # Telegram adapter
│   │
│   ├── tools/
│   │   ├── index.ts             # registers: tool.execute, tool.list
│   │   ├── fs/                  # read, write, edit, exec
│   │   ├── web/                 # fetch, browser
│   │   └── memory/              # search, get
│   │
│   ├── sessions/
│   │   └── index.ts             # registers: session.list, session.history, session.send
│   │
│   └── cron/
│       ├── index.ts             # registers: cron.add, cron.list
│       └── scheduler.ts         # emits: cron.trigger events
│
├── mcp/
│   └── server.ts                # MCP bridge: translates MCP calls to gateway RPC
│
└── ui/
    └── client.ts                # browser WS client
```

---

## Migration Path

### Phase 1: Gateway Core
Build the gateway server, router, event bus, and protocol types. No services yet — just the infrastructure with tests.

### Phase 2: Base Service Client
Implement `ServiceClient` base class. Test with a mock echo service that registers, handles methods, emits events.

### Phase 3: Tools Service
Extract current tools into a service. This is the simplest service (stateless request/response). Verify MCP server still works by bridging through the gateway.

### Phase 4: Sessions Service
Extract session management into a service. Agent and tools call it through the gateway instead of importing `getSessionService()` directly.

### Phase 5: Agent Service
Extract the Pi agent runtime into a service. It subscribes to `message.received` and `cron.trigger`, calls tools and sessions through the gateway.

### Phase 6: Channel Service
Extract WhatsApp/Telegram adapters into a channel service. They emit `message.received` events and handle `channel.send` calls.

### Phase 7: Cron Service
Extract scheduler into a service. Emits `cron.trigger` events on schedule.

### Phase 8: MCP Bridge
The existing MCP server becomes a thin bridge: MCP `CallToolRequest` → `tool.execute` RPC through gateway. MCP `ListToolsRequest` → `tool.list` RPC.

### Phase 9: UI Client
Browser WebSocket client that connects to gateway for live agent streaming and session management.

---

## Requirements Checklist

### Gateway
- [ ] WebSocket server with connection lifecycle
- [ ] Frame parsing and validation (req/res/event)
- [ ] Service registration handshake
- [ ] Method routing (req → target service)
- [ ] Event pub/sub (event → subscribers)
- [ ] Response correlation (req.id → res.id)
- [ ] Request timeout (dead service detection)
- [ ] Backpressure (slow consumer detection + drop)
- [ ] Auth (challenge-response, service tokens, scopes)
- [ ] Health ping/pong
- [ ] Graceful shutdown (drain connections)
- [ ] Event sequencing (gap detection)

### Service Client
- [ ] Base class with connect/register/call/emit
- [ ] Auto-reconnect with exponential backoff
- [ ] Pending request timeout
- [ ] Event handler registration
- [ ] Method handler dispatch

### Services
- [ ] Agent: run, abort, status, streaming deltas
- [ ] Tools: execute, list, describe (+ MCP bridge)
- [ ] Sessions: CRUD, history, message injection
- [ ] Channels: send, status, adapter lifecycle
- [ ] Cron: add, list, remove, trigger events

### Protocol
- [ ] TypeScript types for all frames
- [ ] Zod schemas for validation
- [ ] Serialization helpers (JSON, future: msgpack)

### Observability
- [ ] Frame logging (configurable verbosity)
- [ ] Service connection/disconnection events
- [ ] Method call latency tracking
- [ ] Event delivery confirmation
