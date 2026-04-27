# Bus Architecture & Service Patterns

This document describes Vargos's event-driven architecture—how services communicate, how the bus works, and how to extend the system.

## Core Concepts

Vargos is a **service-oriented event bus system**. All inter-service communication flows through a central `EventEmitterBus`. Services are:
- **Isolated** — no shared state, no direct imports
- **Declarative** — decorated with `@on` (listeners) and `@register` (RPC)
- **Protocol-first** — all contracts defined in a single `EventMap`

This design makes the system:
- ✅ Easy to test (mock the bus)
- ✅ Easy to extend (add a service without modifying others)
- ✅ Reliable (backpressure over crashes, graceful degradation)
- ✅ Observable (all communication is traceable)

---

## Event Types

### Pure Events (Broadcast)

Emitted to all listeners. Fire-and-forget, no response expected:

```typescript
@on('agent.onDelta')
handleDelta(payload: { sessionKey: string; chunk: string }): void

bus.emit('agent.onDelta', { sessionKey: 'main', chunk: 'Hello' });
```

Examples:
- `agent.onDelta` — agent streaming a response chunk
- `agent.onTool` — agent called a tool
- `agent.onCompleted` — agent finished executing
- `channel.onConnected` — channel adapter came online
- `log.onLog` — any service logged something

### Callable Events (Request/Response)

RPC-style methods. Caller waits for a response. Agent-accessible (tools):

```typescript
@register('agent.execute', {
  description: 'Run the agent on a task',
  schema: z.object({ 
    sessionKey: z.string(), 
    task: z.string() 
  })
})
async execute(params: { sessionKey: string; task: string }): Promise<{ response: string }>

const result = await bus.call('agent.execute', { sessionKey: 'main', task: 'hello' });
```

Examples:
- `agent.execute` — run agent on a task
- `agent.abort` — stop a running agent
- `config.get` — fetch current config
- `channel.send` — send a message to a user
- `memory.search` — semantic search over workspace

---

## EventMap: Single Source of Truth

`gateway/events.ts` defines all contracts in one place:

```typescript
export interface EventMap {
  // Pure events — broadcast
  'agent.onDelta': { sessionKey: string; chunk: string };
  'agent.onTool': { 
    sessionKey: string; 
    toolName: string; 
    phase: 'start' | 'end'; 
    args?: Json; 
    result?: Json 
  };
  'agent.onCompleted': { 
    sessionKey: string; 
    success: boolean; 
    response?: string; 
    error?: string 
  };
  'log.onLog': { level: string; service: string; message: string; payload?: any };

  // Callable events — RPC
  'agent.execute': { 
    params: { sessionKey: string; task: string; images?: string[] }; 
    result: { response: string } 
  };
  'channel.send': { 
    params: { sessionKey: string; text: string }; 
    result: { sent: boolean } 
  };
  'memory.search': { 
    params: { query: string; maxResults?: number }; 
    result: MemorySearchResult[] 
  };
  'config.get': { 
    params: Record<string, never>; 
    result: AppConfig 
  };
  // ... more events
}
```

All services depend on EventMap. No service invents its own events.

---

## Service Structure

Every service follows this pattern:

```typescript
import { EventMap, Bus } from './gateway/types';

export class MyService {
  private log = createLogger('my-service');

  constructor(
    private bus: Bus,
    private config: AppConfig,
  ) {}

  // Pure event listener
  @on('some.event')
  private handleEvent(payload: EventMap['some.event']): void {
    this.log.info('Got event', payload);
  }

  // Callable RPC method
  @register('my.tool', {
    description: 'Do something',
    schema: z.object({ x: z.string() })
  })
  async myTool(params: { x: string }): Promise<{ result: string }> {
    return { result: `Processed: ${params.x}` };
  }

  // Lifecycle
  async start(): Promise<void> {
    this.log.info('Starting');
  }

  async stop(): Promise<void> {
    this.log.info('Stopping');
  }
}

export async function boot(bus: Bus): Promise<{ stop(): Promise<void> }> {
  const svc = new MyService(bus, await bus.call('config.get', {}));
  await svc.start();
  await bus.registerService(svc);
  
  return {
    async stop() {
      await svc.stop();
    }
  };
}
```

---

## Boot Sequence

Services are loaded in a specific order (see `index.ts`):

```
1. config     → loads config.json, makes it available to others
2. log        → structured logging, error classification
3. fs         → file I/O (read, write, edit, exec)
4. web        → HTTP fetch, web scraping
5. memory     → hybrid search over workspace
6. agent      → PiAgent runtime, session management
7. cron       → scheduled tasks, heartbeat
8. channels   → WhatsApp/Telegram adapters
9. webhooks   → HTTP webhooks trigger agent
10. mcp       → MCP server (exposes tools to Claude Desktop)
```

Each service can only call earlier services (prevent circular deps):

```
config → (nothing)
log, fs, web → config, log, fs, web
memory → config, log, fs, web
agent → config, log, fs, web, memory
channels, cron → config, log, fs, web, memory, agent
webhooks, mcp → all services
```

---

## Communication Patterns

### Pattern 1: Fire and Forget

Service emits an event, doesn't wait for response:

```typescript
bus.emit('log.onLog', { 
  level: 'info', 
  service: 'my-service', 
  message: 'Something happened' 
});
```

### Pattern 2: Request/Response (Sequential)

One service calls another, waits for answer:

```typescript
const result = await bus.call('agent.execute', {
  sessionKey: 'user:123',
  task: 'What time is it?'
});
console.log(result.response);
```

### Pattern 3: Subscribe to Events

Service listens for events and reacts:

```typescript
@on('agent.onCompleted')
private async onAgentDone(payload: EventMap['agent.onCompleted']): Promise<void> {
  if (payload.success) {
    await bus.call('channel.send', {
      sessionKey: payload.sessionKey,
      text: payload.response!
    });
  }
}
```

### Pattern 4: Broadcast Streaming

Agent streams chunks, UI listens:

```typescript
// Agent service
for (const chunk of response) {
  bus.emit('agent.onDelta', { sessionKey, chunk });
}

// CLI/UI service
@on('agent.onDelta')
private handleChunk(payload: EventMap['agent.onDelta']): void {
  process.stdout.write(payload.chunk);
}
```

---

## TCP/JSON-RPC Protocol

Services communicate over TCP (port 9000) using JSON-RPC 2.0:

**Request** (client → bus):
```json
{ 
  "jsonrpc": "2.0", 
  "method": "agent.execute", 
  "params": { "sessionKey": "main", "task": "hello" }, 
  "id": 1 
}
```

**Response** (bus → client):
```json
{ 
  "jsonrpc": "2.0", 
  "result": { "response": "Hello! I'm ready to help." }, 
  "id": 1 
}
```

**Notification** (bus → subscribed clients):
```json
{ 
  "jsonrpc": "2.0", 
  "method": "bus.notify", 
  "params": { 
    "event": "agent.onDelta", 
    "payload": { "sessionKey": "main", "chunk": "Hello" } 
  } 
}
```

This allows external clients (CLI, web UI, mobile apps) to communicate with Vargos as if it were a traditional API service.

---

## Testing Services

Services are pure functions over EventMap. Test offline:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MyService } from './my-service';

describe('MyService', () => {
  let mockBus: Bus;

  beforeEach(() => {
    mockBus = {
      call: vi.fn(),
      emit: vi.fn(),
    };
  });

  it('handles events', async () => {
    const svc = new MyService(mockBus, testConfig);
    
    svc.handleEvent({ /* payload */ });
    
    expect(mockBus.emit).toHaveBeenCalledWith('some.event', expect.anything());
  });
});
```

Integration tests use the real bus:

```typescript
import { EventEmitterBus } from './gateway/emitter';

describe('Integration', () => {
  it('agent executes task', async () => {
    const bus = new EventEmitterBus();
    await boot(bus);  // Loads all services
    
    const result = await bus.call('agent.execute', {
      sessionKey: 'test',
      task: 'hello'
    });
    
    expect(result.response).toContain('hello');
  });
});
```

---

## Design Principles

1. **Services don't import each other** — only import bus and types
2. **EventMap is immutable** — add new events, never change existing ones
3. **Events are public APIs** — stable contracts, use for testing
4. **Errors flow through events** — no exceptions across service boundaries
5. **Logging goes to bus.emit** — centralized visibility
6. **State lives in config, sessions, or files** — not in service instances

---

## See Also

- [API Reference](../api-reference.md) — Complete event and RPC reference
- [Channels Design](./channels-design.md) — How channel adapters integrate
- [Debugging Guide](../debugging.md) — How to monitor and debug services
