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

## Code Style

- TypeScript with ESM (`.js` extensions on imports)
- Fewer lines is better — delete before extending
- Test at service boundaries, not implementation details
- Follow existing patterns before introducing new ones
- No `console.log` — use `createLogger('service-name')` which emits to `log.onLog`

## License

By contributing, you agree that your contributions will be licensed under the [Apache-2.0 License](./LICENSE).

---

# Architecture

Vargos is a **service-oriented event bus system** where independent services communicate through a central `EventEmitterBus`. All inter-service communication is declarative via decorators and RPC calls — no shared state, no cross-domain imports.

## Design Principles

1. **Fewer lines, more signal** — every line must earn its place. Delete before extending.
2. **Decorative architecture** — `@on` for listeners, `@register` for RPC tools. No manual wiring.
3. **Stateless services** — all state lives in sessions or the file system. Services are interchangeable.
4. **Durable** — graceful degradation everywhere. Backpressure over crashes. Reconnect over failure.
5. **Isolated** — strict domain boundaries. Communication only through bus RPC and events.
6. **Protocol-first** — define the contract (EventMap) before writing code. Types are the documentation.
7. **Observable** — every service logs to the centralized `log.onLog` event bus.

## Directory Structure

```
index.ts                  Boot sequence: instantiate bus, load services in order
gateway/
  bus.ts                  Bus interface (emit, on, call, bootstrap, registerTool)
  emitter.ts              EventEmitterBus implementation
  events.ts               EventMap — single source of truth for all events
  decorators.ts           @on (listener), @register (RPC tool)
  tcp-server.ts           JSON-RPC server on port 9000

services/
  config/                 Config loading, validation, change events
  agent/               PiAgent runtime, session management, streaming events
  channels/               External adapters (WhatsApp, Telegram)
  cron/                   Scheduled tasks, heartbeat, error review
  memory/                 Hybrid search (semantic + BM25) over workspace files
  fs/                     File I/O (read, write, edit, exec)
  web/                    HTTP fetch with markdown/text extraction
  log/                    Structured logging, error store (JSONL)

lib/                      Pure utilities (no service imports)
  paths.ts                Centralized data paths (getDataPaths)
  subagent.ts             Session key helpers for subagent orchestration
  error.ts                Error classification, sanitization
  error-store.ts          Append-only JSONL error persistence
  retry.ts                Exponential backoff wrapper
  directives.ts           Chat directive parser (/think, /verbose)

edge/
  webhooks/               Inbound HTTP triggers
  mcp/                    MCP bridge (HTTP + stdio, bearer auth)
```

## Domain Boundaries

Each service is isolated. ESLint enforces strict import rules via `no-restricted-imports`.

```
lib/                → nothing (pure utilities only)

gateway/            → lib/

services/config/    → gateway/, lib/
services/log/       → gateway/, lib/
services/fs/        → gateway/, lib/ (exception: no restrictions)
services/web/       → gateway/, lib/ (exception: no restrictions)
services/memory/    → gateway/, lib/
services/agent/  → gateway/, lib/ (no other services)
services/cron/      → gateway/, lib/ (no other services)
services/channels/  → gateway/, lib/ (no other services)

edge/webhooks/      → gateway/, lib/
edge/mcp/           → gateway/, lib/
```

Services **NEVER** import each other. They communicate exclusively through `bus.call()` and `bus.emit()`.

## Bus Architecture

### Event Types

**Pure events** — flat payload, broadcast to all listeners:
```typescript
@on('agent.onTool')
handleTool(payload: { sessionKey: string; toolName: string; phase: 'start' | 'end' }): void

bus.emit('agent.onTool', { sessionKey: 'main', toolName: 'read', phase: 'start' });
```

**Callable events** — RPC-style request/response, agent-accessible:
```typescript
@register('agent.execute', {
  description: 'Run the agent on a task',
  schema: z.object({ sessionKey: z.string(), task: z.string() })
})
async execute(params: { sessionKey: string; task: string }): Promise<{ response: string }>

const result = await bus.call('agent.execute', { sessionKey: 'main', task: '...' });
```

### Bootstrap Sequence

```typescript
const bus = new EventEmitterBus();
bus.bootstrap();  // Wire bus itself (bus.search, bus.inspect)

for (const [label, load] of SERVICES) {
  const { boot } = await load();
  const { stop } = await boot(bus);
  if (stop) stoppers.push(stop);
}

await startTCPServer(bus, '127.0.0.1', 9000);
bus.emit('bus.onReady', {});  // Signals boot completion
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
  'agent.onTool':      { sessionKey: string; toolName: string; phase: 'start' | 'end'; args?: Json; result?: Json };
  'agent.onCompleted': { sessionKey: string; success: boolean; response?: string; error?: string };
  'channel.onConnected': { instanceId: string; type: string };

  // Callable events
  'agent.execute':  { params: AgentExecuteParams; result: { response: string } };
  'agent.abort':    { params: { sessionKey: string }; result: { aborted: boolean } };
  'config.get':     { params: Record<string, never>; result: AppConfig };
  'channel.send':   { params: { sessionKey: string; text: string }; result: { sent: boolean } };
  'cron.add':       { params: CronAddParams; result: void };
  'memory.search':  { params: { query: string; maxResults?: number }; result: MemorySearchResult[] };
  // ... and more
}
```

Services never define their own event types — they depend on EventMap.

## Services Overview

Boot order (see `index.ts`):

1. **config** — Loads `~/.vargos/config.json`, validates, holds mutable state
2. **log** — Structured logging, error classification, persistence
3. **fs** — File I/O: read, write, edit, exec
4. **web** — HTTP fetch + text extraction
5. **memory** — Hybrid search over workspace files
6. **agent** — PiAgent runtime, session management, streaming events
7. **cron** — Scheduled tasks, heartbeat, error review
8. **channels** — WhatsApp/Telegram adapters, inbound routing

## Message Flow Examples

### WhatsApp DM → Agent → Reply

```
1. WhatsApp adapter receives message
2. ChannelsService.onInboundMessage(): expand links, start typing, init reactions
3. ChannelsService.runAgent(): bus.call('agent.execute', { sessionKey, task, images })
4. AgentRuntime: get/create PiAgent session, run prompt, stream events to bus
5. Agent completes, emits agent.onCompleted
6. ChannelsService: stop typing, set reaction, bus.call('channel.send', { text })
```

### Subagent Orchestration

```
1. Parent agent calls: bus.call('agent.execute', { sessionKey: 'parent:subagent:ts', task: 'subtask' })
2. AgentRuntime creates child session, runs independently
3. Child completes, emits agent.onCompleted with child sessionKey
4. Parent synthesizes results and delivers to user
```

## Testing

Services are pure functions over EventMap. Test them offline:

```typescript
// No bus required
const agent = new AgentRuntime({ bus: mockBus, config: testConfig });
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

# Philosophy

Design principles that guide Vargos development.

## 1. Token Budget is Sacred

The system prompt is injected into every API call. Every character costs real money and displaces context.

**Rules:**
- System prompt should stay under 4,000 characters for channel sessions
- Tools are declared in the API schema — don't re-describe them in the prompt
- If a section only applies to one mode, don't inject it in other modes

## 2. The Model Already Knows

LLMs know how to use tools, write code, and follow instructions. The system prompt should tell the model what makes *this* agent different.

**Don't:** List shell command examples, explain what tools do when the schema already describes them.
**Do:** Define identity and personality, set behavioral boundaries, provide environment-specific context.

## 3. Every Byte Earns Its Place

Before adding anything, ask: "Does this change the model's behavior in a measurable way?" If not, delete it.

## 4. Fail Loud, Recover Quiet

Transient failures (network drops, API timeouts) should retry silently. Permanent failures (bad config, missing credentials) should fail immediately with clear errors.

## 5. Workspace Files Are User Territory

Template files are copied once on first boot. After that, the agent and user own the workspace copies. The codebase should never silently overwrite them.

## 6. Observe Everything, Log What Matters

Every service logs to the centralized `log.onLog` event via `createLogger()`. Stream deltas to the event bus for live UIs. Don't log every token — log transitions.

## 7. The Gateway Is Dumb

The gateway routes frames. It knows nothing about agents, tools, channels, or sessions. This is the foundation of the architecture — protect it.

---

# Project Status

See [FEATURES.md](./FEATURES.md) for the complete feature inventory with implementation status.

## Roadmap

See [docs/ROADMAP.md](./docs/ROADMAP.md) for planned features and design docs.

---

# Known Issues

See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) for current bugs and workarounds.
