# Tools

In Vargos, **services are tools**. Every method registered with the `@register` decorator on a service is automatically:

1. Callable over the bus via `bus.call('event.name', params)`
2. Exposed to the agent as a tool (auto-wrapped by [`services/agent/tools.ts`](../../services/agent/tools.ts) `createCustomTools`)
3. Reachable from external clients via the TCP gateway and the MCP bridge (when enabled)

Write a service method, get a tool for free.

## Anatomy of a service method

The simplest reference is any existing service — read [`services/web/index.ts`](../../services/web/index.ts) for a single-method example, [`services/cron/index.ts`](../../services/cron/index.ts) for multiple methods + scheduled work, or [`services/agent/index.ts`](../../services/agent/index.ts) for the most elaborate.

Pattern in short:
- Decorate handler methods with `@register('event.name', { description, schema })` (callable RPC + agent tool) or `@on('event.name')` (pure event listener).
- The `description` and `schema` (Zod) become the agent's tool definition. Write them like documentation for the agent — clear "what it does" and "when to use it".
- Each service exports a `boot(bus)` function that calls `bus.bootstrap(this)`.
- Add a typed entry in [`gateway/events.ts`](../../gateway/events.ts) `EventMap` for params + result.
- Register the boot in [`index.ts`](../../index.ts) `SERVICES` array.

## Conventions

- **Services live at** `services/<domain>/index.ts`. One `boot(bus)` export per service.
- **Logger**: `createLogger('service-name')` — never `console.log`. Output flows through `log.onLog`.
- **Domain boundaries**: cross-domain imports are blocked by ESLint (`no-restricted-imports`). To call another service, use `bus.call('other.method', params)`.
- **Type-only imports** from `services/config/` are allowed for `AppConfig`.
- **Async**: every `@register`-ed method should be `async` — `bus.call` returns a Promise.

## What the agent sees

For each `@register`-ed method, Pi SDK gets a tool with `name`, `description`, and Zod-derived `input_schema`. The agent calls the tool by name; `sessionKey` is auto-injected from the active run.

## Filtering tools per channel

Channel personas (`~/.vargos/agents/<channelId>.md`) carry an `allowedTools` glob whitelist. The agent in that channel sees only matching bus tools. Pi SDK built-ins (`read`/`bash`/...) always pass through. See [Personas](../usage/personas.md).

## External MCP servers

Tools exposed by external MCP servers (configured under `mcpServers` in `~/.vargos/config.json`) are loaded by [`services/mcp-client/`](../../services/mcp-client/) and namespaced as `mcp.<server>.<tool>`. They behave like any other bus tool — same wrapping, same persona filter applies.

## Pi SDK built-in tools

Filesystem primitives Pi SDK ships, always available regardless of bus tools or persona filters:

| Tool | Description |
|---|---|
| `read` | Read file contents |
| `bash` | Execute shell commands |
| `edit` | String-replace edits in a file |
| `write` | Create / overwrite a file |
| `grep` | Search file contents |
| `find` | Locate files |
| `ls` | List directory |

Pi SDK's `initialActiveToolNames` defaults to `[read, bash, edit, write]` — others are loaded on demand.

## See also

- [API Reference](../api-reference.md) — bus event catalog
- [Bus Design](../architecture/bus-design.md) — how `@register` and `@on` are wired
- [Personas](../usage/personas.md) — per-channel tool filtering
- [`gateway/events.ts`](../../gateway/events.ts) — single source of truth for bus events
