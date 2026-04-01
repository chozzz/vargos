# Contributing to Vargos

Thanks for your interest in Vargos.

## Issues First

Before opening a PR, start with an issue:

- **Bug reports** — what happened, what you expected, steps to reproduce
- **Feature requests** — describe the use case, not just the solution
- **Questions** — anything unclear about the project

[Open an issue](https://github.com/chozzz/vargos/issues)

## Pull Requests

1. **Open an issue first** — propose your idea or bugfix before writing code
2. **Wait for feedback** — we'll discuss scope and approach
3. **Keep it focused** — small, single-purpose PRs are easier to review
4. **Test your changes** — run `pnpm run test:run` and `pnpm run typecheck`

Not every PR will be merged. We review carefully to keep the project focused.

## Code Style

- TypeScript with ESM (`.js` extensions on imports)
- Fewer lines is better — delete before extending
- Test at service boundaries, not implementation details
- Follow existing patterns before introducing new ones

## License

By contributing, you agree that your contributions will be licensed under the [Apache-2.0 License](./LICENSE).

---

# Architecture

Vargos is a **service-oriented event bus system** where independent services communicate through a central `EventEmitterBus`. All inter-service communication is declarative via decorators and RPC calls — no shared state, no cross-domain imports.

## Design Principles

1. **Fewer lines, more signal** — every line must earn its place. Delete before extending.
2. **Decorative architecture** — `@on` for listeners, `@register` for RPC tools. No manual wiring.
3. **Compaction** — dense, layered abstractions. One concept per module.
4. **Stateless services** — all state lives in sessions or the file system. Services are interchangeable.
5. **Durable** — graceful degradation everywhere. Backpressure over crashes. Reconnect over failure. Persist over memory.
6. **Isolated** — strict domain boundaries. Communication only through bus RPC and events.
7. **Observable** — every call has a correlation ID. Every event has a sequence. Trace any message end-to-end.
8. **Protocol-first** — define the contract (EventMap) before writing code. Types are the documentation.
9. **Testable** — services are pure functions. Test them offline; integration tests use the real bus.
10. **Scalable** — services can scale independently. TCP/JSON-RPC is network-agnostic.

## Directory Structure

```
index.ts                  Boot sequence: instantiate bus, load services in order
gateway/
  bus.ts                  Bus interface (emit, on, call, bootstrap, registerTool)
  emitter.ts              EventEmitterBus implementation
  events.ts               EventMap — single source of truth for all events
  decorators.ts           @on (listener), @register (RPC tool)
  tcp-server.ts           JSON-RPC server on port 9000
  context.ts              AsyncLocalStorage for RunContext

services/
  config/                 Config loading, validation, change events
  log/                    Structured logging, error store (JSONL)
  sessions/               Session storage, message history (JSONL)
  fs/                     File I/O (read, write, edit, exec)
  web/                    HTTP fetch with markdown/text extraction
  workspace/              Skills and agent definitions scanner
  memory/                 Hybrid search (semantic + BM25) over workspace files
  agent/                  Pi agent runtime, execution queue, history injection
  cron/                   Scheduled tasks, heartbeat, error review
  channels/               External adapters (WhatsApp, Telegram)

lib/
  Pure utilities: logger, debouncer, errors, retry, media, mask, skills, agents

edge/
  mcp/                    MCP bridge (HTTP + stdio, bearer auth)
  webhooks/               Inbound HTTP triggers
```

## Domain Boundaries

Each service is isolated. ESLint enforces strict import rules via `no-restricted-imports`.

```
lib/                → nothing (pure utilities only)

gateway/            → lib/

services/config/    → gateway/, lib/
services/log/       → gateway/, lib/
services/sessions/  → gateway/, lib/
services/fs/        → gateway/, lib/
services/web/       → gateway/, lib/
services/workspace/ → gateway/, lib/
services/memory/    → gateway/, lib/
services/agent/     → gateway/, lib/ (no other services)
services/cron/      → gateway/, lib/ (no other services)
services/channels/  → gateway/, lib/ (no other services)

edge/mcp/           → gateway/, lib/
edge/webhooks/      → gateway/, lib/
```

Services **NEVER** import each other. They communicate exclusively through `bus.call()` and `bus.on()`.

## Bus Architecture

### Event Types

**Pure events** — flat payload, broadcast to all listeners:
```typescript
@on('agent.onDelta')
handleDelta(payload: { sessionKey: string; chunk: string }): void

bus.emit('agent.onDelta', { sessionKey: 'main', chunk: 'hello' });
```

**Callable events** — RPC-style request/response, agent-accessible:
```typescript
@register('agent.execute', {
  description: 'Execute an agent on a session',
  schema: z.object({ sessionKey: z.string(), task: z.string() })
})
async execute(params: AgentExecuteParams): Promise<{ response: string }>

const result = await bus.call('agent.execute', { sessionKey: 'main', task: '...' });
```

### Bootstrap Sequence

```typescript
const bus = new EventEmitterBus();
bus.bootstrap();  // Wire bus itself (bus.search, bus.inspect)

for (const [label, load] of SERVICES) {
  const { boot } = await load();
  await boot(bus);
}

await startTCPServer(bus, '127.0.0.1', 9000);
bus.emit('bus.onReady', {});
```

### RPC Protocol (TCP/JSON-RPC)

Port 9000 handles three message types:

**Request** (client → bus):
```json
{ "jsonrpc": "2.0", "method": "agent.execute", "params": {...}, "id": 1 }
```

**Response** (bus → client):
```json
{ "jsonrpc": "2.0", "result": {...}, "id": 1 }
```

**Notification** (bus → client, for subscriptions):
```json
{ "jsonrpc": "2.0", "method": "bus.notify", "params": { "event": "agent.onDelta", "payload": {...} } }
```

## EventMap (Single Source of Truth)

`gateway/events.ts` defines all inter-service contracts in one place:

```typescript
export interface EventMap {
  // Pure events
  'agent.onDelta':     { sessionKey: string; chunk: string };
  'agent.onCompleted': { sessionKey: string; success: boolean; response?: string };
  'channel.onInbound': { channel: string; userId: string; sessionKey: string; content: string };

  // Callable events
  'agent.execute':  { params: AgentExecuteParams; result: { response: string } };
  'config.get':     { params: Record<string, never>; result: AppConfig };
  'session.create': { params: SessionCreateParams; result: void };
  // ... 20+ more
}
```

Services never define their own event types — they depend on EventMap. This enforces single source of truth.

## Services Overview

Boot order (see `index.ts`):

1. **config** — Loads `~/.vargos/config.json`, validates, holds mutable state
2. **log** — Structured logging, error classification, persistence
3. **sessions** — Session storage (JSONL files), message history
4. **fs** — File I/O: read, write, edit, exec
5. **web** — HTTP fetch + text extraction
6. **workspace** — Skills and agent definitions scanner
7. **memory** — Hybrid search over workspace files
8. **agent** — Pi runtime, queuing, history injection
9. **cron** — Scheduled tasks, heartbeat, error review
10. **channels** — WhatsApp/Telegram adapters, inbound routing

## Message Flow Examples

### WhatsApp DM → Agent → Reply

```
1. WhatsApp adapter receives message
2. Adapter calls: bus.call('session.addMessage', { ... })
3. Adapter emits: bus.emit('channel.onInbound', { ... })
4. AgentService listens, calls: bus.call('agent.execute', { ... })
5. Agent loads history, executes tools, streams deltas
6. Agent completes, emits: bus.emit('agent.onCompleted', { ... })
7. AgentService sends reply via: bus.call('channel.send', { ... })
```

### Sub-agent Orchestration

```
1. Parent agent calls: bus.call('agent.spawn', { sessionKey: 'child-123', task: 'subtask' })
2. AgentService creates child session, spawns child execution
3. Child runs independently, completes
4. Result announced to parent as system message
5. Parent re-triggered (debounced 3s) to synthesize results
```

## Testing

Services are pure functions over EventMap. Test them offline:

```typescript
// No bus required
const agent = new AgentService(config);
const result = await agent.execute({ sessionKey: 'test', task: 'hello' });
expect(result.response).toContain('hello');
```

Integration tests use the real bus:

```typescript
const bus = new EventEmitterBus();
await boot(bus);

const result = await bus.call('agent.execute', { sessionKey: 'test', task: 'hello' });
expect(result.response).toContain('hello');
```

---

# Events Reference

All events flow through the gateway's pub/sub bus. A service emits an event; the gateway fans it out to every service that declared that topic in its `subscriptions` list.

## Agent Events

| Event | Type | Payload | Subscribers |
|-------|------|---------|-------------|
| `run.started` | Pure | `{ sessionKey, runId }` | channel (typing indicator) |
| `run.delta` | Pure | `{ sessionKey, runId, type, data }` | channel, cli-client |
| `run.completed` | Pure | `{ sessionKey, runId, success, response }` | channel, cron, cli-client |
| `run.tool` | Pure | `{ sessionKey, runId, toolName, phase, args?, result? }` | cli-client |
| `execute` | Callable | `{ sessionKey, task, model?, ... }` → `{ response }` | — |

## Channel Events

| Event | Type | Payload | Subscribers |
|-------|------|---------|-------------|
| `message.received` | Pure | `{ channel, userId, sessionKey, content, metadata? }` | agent |
| `connected` | Pure | `{ instanceId }` | — |
| `disconnected` | Pure | `{ instanceId, reason }` | — |
| `send` | Callable | `{ sessionKey, text }` → `{ sent }` | — |

## Cron Events

| Event | Type | Payload | Subscribers |
|-------|------|---------|-------------|
| `trigger` | Pure | `{ taskId, name, task, sessionKey, notify? }` | agent |
| `add/update/remove/run` | Callable | Various | — |

## Webhook Events

| Event | Type | Payload | Subscribers |
|-------|------|---------|-------------|
| `trigger` | Pure | `{ hookId, task, sessionKey, notify? }` | agent |

## Sessions Events

| Event | Type | Payload | Subscribers |
|-------|------|---------|-------------|
| `created` | Pure | `{ sessionKey, kind }` | — |
| `message` | Pure | `{ sessionKey, role }` | — |
| `create/addMessage/getMessages/get/delete` | Callable | Various | — |

## Subscription Summary

| Service | Subscribes to | Why |
|---------|---------------|-----|
| **agent** | `message.received`, `cron.trigger`, `webhook.trigger` | Trigger runs |
| **channel** | `run.started`, `run.delta`, `run.completed` | Status reactions |
| **cron** | `run.completed` | Release concurrency lock |
| **cli-client** | `run.delta`, `run.completed`, `run.tool` | Terminal output |

---

# Philosophy

Design principles that guide Vargos development. Every PR and feature should be evaluated against these.

## 1. Token Budget is Sacred

The system prompt is injected into every single API call. Every character costs real money and displaces context the model needs for the actual task. Treat the system prompt like a production binary — measure it, profile it, optimize it.

**Rules:**
- System prompt should stay under 4,000 characters for channel sessions
- Tools are already declared in the API schema — don't re-describe them
- External tools (MCP servers) should be summarized by server name and count, not listed individually
- If a section only applies to one mode (e.g. heartbeat guidance for cron), don't inject it in other modes

## 2. The Model Already Knows

LLMs know how to use tools, write code, and follow instructions. The system prompt should tell the model what makes *this* agent different — not re-teach general capabilities.

**Don't:**
- List shell command examples (`git clone`, `npm install`) — the model knows these
- Explain what tools do when the tool schema already has a description
- Add instructions like "wait for results before proceeding" — that's how tool calling works

**Do:**
- Define identity and personality (via SOUL.md)
- Set behavioral boundaries (what to do vs. ask first)
- Provide environment-specific context (workspace path, infrastructure)

## 3. Every Byte Earns Its Place

Before adding anything to the system prompt, codebase, or workspace files, ask: "Does this change the model's behavior in a measurable way?" If not, delete it.

## 4. Separate Concerns Across Layers

| Layer | Owns | Source |
|-------|------|--------|
| Identity | Who the agent is | SOUL.md |
| Rules | How the agent behaves | AGENTS.md |
| Environment | What's available | TOOLS.md, tool schemas |
| Context | What's happening now | Channel, session, system info |

If behavioral guidance creeps into TOOLS.md, or environment details into SOUL.md, refactor them back to their layer.

## 5. Fail Loud, Recover Quiet

Transient failures (network drops, API timeouts) should retry silently. Permanent failures (bad config, missing credentials) should fail immediately with clear errors.

**Applied to the agent runtime:**
- Network errors → retry (up to 2 attempts), log each attempt
- Invalid API key → fail immediately, tell the user
- Model returns empty → log it, skip delivery, don't crash
- Never swallow errors silently — if nothing is logged, it didn't happen

## 6. Workspace Files Are User Territory

Template files (`docs/templates/`) are copied once on first boot. After that, the agent and user own the workspace copies. The codebase should never silently overwrite them.

**Rules:**
- Templates are reference only — never assume they match what's live
- The heartbeat maintains workspace files, not code deploys
- If a template changes, the heartbeat will naturally evolve the live file over time

## 7. Observe Everything, Log What Matters

The system should never appear "stuck" or "silent" when it's actually working. Every state transition should be visible in logs.

**Applied to the runtime:**
- Log when prompting the model
- Log when tool execution starts and ends
- Log when waiting for model response after tool results
- Stream deltas to the event bus for live UIs
- Don't log every token — log transitions

## 8. The Gateway Is Dumb

The gateway routes frames. It knows nothing about agents, tools, channels, or sessions. This is the foundation of the architecture — protect it.

---

# Project Status

See [FEATURES.md](./FEATURES.md) for the complete feature inventory with implementation status.

## Roadmap

### Phase 1: Voice Foundation
- Inbound Twilio adapter with STT/TTS
- VoiceSession for real-time conversation
- LocalAI integration for low-latency voice

### Phase 2: Web Observability
- HTTP + SSE service on port 9003
- React dashboard for sessions, runs, cron, channels
- Real-time streaming of agent deltas and tool calls

### Phase 3: Outbound Voice Calls
- `phone_call` tool for agent-initiated calls
- Cron-triggered outbound conversations
- Call transcript + summary delivery

### Phase 4: Guest Voice Agents
- Caller ID → guest profile lookup
- Per-call persona injection
- Hospitality/concierge skill packs

See [docs/internal/roadmap/](./docs/internal/roadmap/) for detailed design docs.

---

# Known Issues

See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) for current bugs and workarounds.
