# Bus Architecture

Vargos services communicate exclusively through a typed `EventEmitterBus`. No shared state, no direct cross-domain imports — those are enforced by ESLint (`no-restricted-imports`).

Source files:
- [`gateway/bus.ts`](../../gateway/bus.ts) — `Bus` interface
- [`gateway/emitter.ts`](../../gateway/emitter.ts) — default `EventEmitterBus` implementation
- [`gateway/events.ts`](../../gateway/events.ts) — typed `EventMap` (the contract — single source of truth)
- [`gateway/decorators.ts`](../../gateway/decorators.ts) — `@on` and `@register`
- [`gateway/tcp-server.ts`](../../gateway/tcp-server.ts) — TCP/JSON-RPC entry point

## Two event shapes

| Shape | Semantic | Decorator | Caller API |
|---|---|---|---|
| **Pure** | Fire-and-forget | `@on('event')` | `bus.emit('event', payload)` |
| **Callable** | Request/reply (RPC) | `@register('event', { description, schema })` | `bus.call('event', params)` |

Each `@register`-ed callable is also auto-wrapped as an agent tool by [`services/agent/tools.ts`](../../services/agent/tools.ts) `wrapEventAsToolDefinition` — so agents call them by name, with `sessionKey` auto-injected.

## Service shape

A service is a class with `@on` / `@register` decorated methods, plus a `boot(bus)` export that instantiates it and calls `bus.bootstrap(this)`. See any of:

- [`services/agent/index.ts`](../../services/agent/index.ts) — most elaborate
- [`services/cron/index.ts`](../../services/cron/index.ts) — `@register` + `@on` mix
- [`services/web/index.ts`](../../services/web/index.ts) — minimal example

Boot order is centrally defined in [`boot.ts`](../../boot.ts):

```
config → log → web → memory → media → agent → channels → cron → mcp-client → tcp server → bus.onReady
```

`edge/mcp/` (MCP server) and `edge/webhooks/` exist in code but are commented out at boot.

## Process supervision and `bus.restart`

[`index.ts`](../../index.ts) is a tiny supervisor (~50 LOC). It spawns [`boot.ts`](../../boot.ts) as a child process and respawns it when the child exits with code 42. Any other exit code passes through.

The `bus.restart` tool is registered at runtime in `boot.ts` via `bus.registerTool` (the bus itself stays ignorant of supervisor semantics). It returns `{ ok: true }` immediately, then schedules `process.exit(42)` on the next tick — so callers (e.g. an agent) receive the response before the child dies. The supervisor catches the exit, waits 500ms, and re-spawns. The new child reads all code fresh from disk, which is the point: `git pull && bus.restart` reliably picks up source AND transitive deps (ESM module cache doesn't survive a process restart).

Use cases:
- Auto-update cron: `cd /repo && git pull && pnpm install && pnpm build && bus.restart`
- Config edits the agent makes to itself
- Agent recovering from a degraded MCP/channel state

Caveats:
- ~10s downtime while the child cold-starts. In-flight bus calls die.
- Dev mode (`pnpm start` in a terminal) works — the supervisor is the same in dev and prod.
- Running `boot.ts` directly (skipping `index.ts`) means `exit(42)` just exits without respawn. Always go through the supervisor.

## Domain boundaries

Cross-domain imports are blocked by ESLint configuration in [`eslint.config.mjs`](../../eslint.config.mjs). To call into another service, use `bus.call('other.service.method', params)`. The only allowed cross-import is type-only from `services/config/` (for `AppConfig`).

This forces the boundaries that make services:
- Independently testable — mock the bus, not collaborators
- Independently deployable — services could move to separate processes by swapping the `Bus` implementation
- Replaceable — any service can be substituted without touching another

## TCP gateway

The TCP server speaks **JSON-RPC 2.0 over raw TCP** on `127.0.0.1:9000` (configurable via `gateway.host`/`gateway.port` in `config.json`). Not HTTP. Use `nc` or a JSON-RPC TCP client:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"bus.search","params":{}}' | nc -q 1 127.0.0.1 9000
```

The MCP bridge at [`edge/mcp/`](../../edge/mcp/) exposes the same surface over HTTP/SSE for MCP clients (Claude Desktop, etc.) but is currently commented out in `boot.ts`.

## Introspection

The bus self-describes:
- `bus.search` — list all registered events with metadata
- `bus.inspect` — get one event's full schema (params + result)

Useful for the agent itself: it can call `bus.search({ query: 'memory' })` to discover memory tools at runtime.

## See also

- [API Reference](../api-reference.md) — full bus event catalog
- [Channels Design](./channels-design.md) — channel adapter architecture
- [Tools](../extending/tools.md) — how to add new bus methods
