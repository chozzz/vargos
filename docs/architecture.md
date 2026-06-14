# Architecture

Vargos is a single **bus** that owns one **registry** of methods. The CLI, the agent's
tools, and the JSON-RPC server are all *projections* of that registry — register a method
once and it appears, identically, on every surface.

Source: [`core/`](../core/) — `bus.ts`, `loader.ts`, `rpc-server.ts`, `cli.ts`, `services.ts`, `types.ts`.

## Methods vs events

| Concept | API | Validated | Surfaced |
|---|---|---|---|
| **Method** | `bus.register(name, opts, handler)` / `bus.call(name, params)` | zod, on every surface | CLI, agent tool, JSON-RPC |
| **Event** | `bus.emit(event, payload)` / `bus.on(event, fn)` | no | internal pub/sub only |

`bus.call('does.not.exist')` throws a structured `MethodNotFoundError` (JSON-RPC `-32601`);
bad params throw `ValidationError` (`-32602`). `bus.emit` with no listeners is a silent no-op.

## Service contract

Each service is `services/<name>/index.ts` exporting `createService(): Service`:

```ts
interface Service {
  name: string;                 // = directory name = method namespace (channel → channel.*)
  init(bus: Bus): Promise<void>; // register methods/handlers, open resources
  dispose(): Promise<void>;      // close sockets, clear timers — MUST fully release
}
```

Services never import each other; all cross-service calls go through `bus.call` / `bus.emit`
(enforced by ESLint `no-restricted-imports`). No module-level mutable state — everything lives
on the instance so it's disposed on reload. The shared data contract is `services/config/schemas`.

A method's registration is the single source of truth:

```ts
bus.register('channel.send', {
  schema: z.object({ recipient: z.string(), message: z.string() }), // validation, all surfaces
  description: 'Send a message via a channel',                       // CLI help + tool description
  cli: { positional: ['recipient', 'message'] },                    // positional arg order
}, (p) => this.send(p));
```

## Discovery and load order

`boot.ts` discovers services by scanning `services/*/index.<ext>` — no manifest; drop a folder
in and it loads. `config` and `log` load first (others read config during `init`); the rest are
sorted. `edge/` (`mcp-edge`, `webhook`) is migrated but not auto-discovered.

## Surfaces

- **CLI** (`vargos`) — `vargos <service>` lists methods, `vargos <service> --help` shows arg
  shapes, `vargos <service> <method> …` invokes. It proxies to a running daemon on `:9000`;
  if none answers, it boots a local stack with only the needed service(s), runs, and disposes.
- **Agent tools** — every non-`internal` method becomes a tool (`bus.list()` in
  [`services/agent/tools.ts`](../services/agent/tools.ts)); persona `allowedTools` filters.
- **JSON-RPC 2.0 over TCP** on `127.0.0.1:9000` (localhost only; API-key auth is a future hook):

  ```bash
  echo '{"jsonrpc":"2.0","method":"memory.search","params":{"query":"..."}}' | nc localhost 9000
  ```

## Hot reload & supervision

`bus.restart <service>` reloads one service from disk in-process (same PID) via a cache-busting
dynamic import: the loader releases the old instance's methods + listeners, calls `dispose()`,
re-imports, and runs `init()` again — other services keep running and retain state.

`bus.restartProcess` exits with code 42; the supervisor [`index.ts`](../index.ts) respawns
`boot.ts`, reloading all code and transitive deps from disk (`git pull && bus.restartProcess`).

> **Known limitation.** Cache-busting `import('./svc.ts?v=' + Date.now())` leaks the prior
> module generation in memory each reload (ESM has no cache invalidation). `dispose()`
> discipline bounds the *resource* leak (timers, sockets) but not the *module* leak — fine for
> occasional restarts, pathological under hundreds/day. Revisit per-service worker processes if
> reload frequency grows. Acceptance for all of the above is encoded in [`scripts/verify-core.ts`](../scripts/verify-core.ts) (`pnpm verify`).

## Channels

The `channel` service manages messaging adapters (Telegram, WhatsApp/Baileys) behind a common
`ChannelAdapter` contract (`services/channel/base-adapter.ts`). Inbound: adapter → normalize →
pipeline (link-expand, whitelist) → `agent.execute`; `agent.onCompleted` delivers the reply.
Outbound: `channel.send` → strip markdown → chunk → `adapter.send`.

## See also

- [CLI reference](./cli.md) · [Configuration](./configuration.md) · [Usage](./usage.md) · [Extending](./extending.md)
