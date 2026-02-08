# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Workflow

**Every task follows this cycle:**

1. **Read MDs first** — check CLAUDE.md, ARCHITECTURE.md, and any relevant docs before writing code.
2. **Do the work** — implement with the coding philosophy below. Fewer lines wins.
3. **Cover with tests** — behavior-level tests at service boundaries. No test = not done.
4. **Update MDs after** — if the work changes architecture, conventions, or directory structure, update the relevant MDs before finishing.

## Coding Philosophy

1. **LOCs** — fewer lines of code is always better. Delete before extending.
2. **Full RPC + events + streaming** — the gateway handles all inter-service communication. One protocol, three frame types (req/res/event). See ARCHITECTURE.md.
3. **Compaction** — dense, layered abstractions. One concept per module. If two things do similar work, merge them.
4. **Scalable** — services communicate over WebSocket. They can run in-process or across machines.
5. **Maintainable** — adding a service never requires touching the gateway. Registration is declarative.
6. **Isolated** — services share nothing. State lives in sessions. Communication goes through the gateway.
7. **Observable** — every frame has an ID. Every event has a sequence number. Trace any message end-to-end.
8. **Protocol-first** — define types before writing code. The TypeScript types ARE the documentation.
9. **Test at boundaries** — mock the gateway, test each service in isolation.

## Project Overview

Vargos is a **service-oriented system** where independent services (agent, tools, channels, sessions, cron) communicate through a WebSocket gateway. It exposes tools via MCP protocol and routes messages from WhatsApp/Telegram channels.

**Single entry point:** `src/cli/index.ts` — interactive menu or direct commands (`vargos`, `vargos gateway start`, etc.)

## Structure

```
src/
├── start.ts                     # Legacy entry (delegates to cli/gateway/start)
├── cli/
│   ├── index.ts                 # Entry: parse argv OR show interactive menu
│   ├── tree.ts                  # Menu tree definition (single source of truth)
│   ├── menu.ts                  # Interactive menu walker (@clack/select)
│   ├── client.ts                # CliClient + connectToGateway()
│   ├── boot.ts                  # loadAndValidate(): config + paths + validation
│   ├── pid.ts                   # PID file helpers for gateway lifecycle
│   ├── chat.ts                  # Interactive chat session
│   ├── run.ts                   # One-shot task execution
│   ├── health.ts                # Config + gateway connectivity check
│   ├── config/
│   │   ├── llm.ts              # show() + edit()
│   │   ├── channel.ts          # show() + edit()
│   │   └── context.ts          # show() + edit($EDITOR)
│   └── gateway/
│       ├── start.ts             # Full gateway boot (absorbs old start.ts)
│       ├── stop.ts              # Stop via PID
│       ├── restart.ts           # Restart via SIGUSR2
│       └── status.ts            # PID check
│
├── gateway/                     # WS gateway server
│   ├── server.ts                # WebSocket server, connection lifecycle
│   ├── protocol.ts              # Frame types, Zod schemas, parse/serialize
│   ├── router.ts                # Method routing table
│   ├── bus.ts                   # Event pub/sub with sequence counter
│   ├── registry.ts              # Service registration tracking
│   └── index.ts                 # Re-exports
│
├── services/                    # Gateway services
│   ├── client.ts                # ServiceClient base class
│   ├── agent/                   # agent.run, agent.abort, agent.status
│   ├── channels/                # channel.send, channel.status, channel.list
│   ├── tools/                   # tool.execute, tool.list, tool.describe
│   ├── sessions/                # session CRUD, history, messages
│   └── cron/                    # cron.list, cron.add, emits cron.trigger
│
├── mcp/                         # MCP bridge (MCP ↔ gateway RPC)
│   └── server.ts                # stdio + HTTP transports
│
├── core/                        # Framework (registries, interfaces, runtime)
│   ├── extensions.ts            # VargosExtension + ExtensionContext interfaces
│   ├── config/                  # paths, validate, pi-config, onboard, workspace, identity
│   ├── runtime/                 # PiAgentRuntime, queue, lifecycle, prompt, history
│   ├── gateway/                 # Legacy Gateway class (input normalizer, used by adapters)
│   ├── services/                # IMemoryService, ISessionService, ServiceFactory
│   ├── tools/                   # ToolRegistry, Tool interface, BaseTool, types
│   ├── channels/                # ChannelAdapter interface, factory, config, onboard
│   └── lib/                     # errors, path, dedupe, debounce, reply-delivery, mime, media
│
└── extensions/                  # Built-in implementations
    ├── tools-fs/                # read, write, edit, exec
    ├── tools-web/               # web-fetch, browser
    ├── tools-agent/             # sessions-*, cron-*, process
    ├── tools-memory/            # memory-search, memory-get
    ├── channel-whatsapp/        # adapter, session
    ├── channel-telegram/        # adapter, types
    ├── gateway-plugins/         # text, image, media input handlers
    ├── service-file/            # FileMemory, FileSessions, MemoryContext, sqlite-storage
    └── cron/                    # scheduler, vargos-analysis tasks
```

## CLI

Bare `vargos` shows an interactive menu. Direct commands mirror the menu tree:

```
vargos                         # Interactive menu
vargos chat                    # Interactive chat (requires gateway)
vargos run <task>              # One-shot task
vargos config llm show         # Display LLM config
vargos config llm edit         # Change provider/model/key
vargos config channel show     # Display channel config
vargos config channel edit     # Open config.json in $EDITOR
vargos config context show     # List context files
vargos config context edit     # Edit context file in $EDITOR
vargos gateway start           # Start gateway + all services
vargos gateway stop            # Stop running gateway
vargos gateway restart         # Restart via SIGUSR2
vargos gateway status          # PID check
vargos health                  # Config + connectivity check
```

## Development Commands

```bash
pnpm install              # Install deps
pnpm start                # Start gateway + all services
pnpm cli                  # Interactive menu
pnpm cli chat             # Interactive chat (requires gateway running)
pnpm cli run "task"       # One-shot task
pnpm test                 # Tests (watch mode)
pnpm run test:run         # Tests (CI, run once)
pnpm lint                 # ESLint + typecheck
pnpm run typecheck        # TypeScript only
```

## Coding Conventions

### Imports
- ESM with `.js` extensions on all internal imports
- External packages first, then internal
- Core: `../../core/tools/types.js`
- Cross-service: `../sessions/index.js`

### Patterns
- **File naming**: kebab-case (`memory-search.ts`), PascalCase classes (`MemoryContext`)
- **Tool implementation**: Zod schema → execute(args, context) → ToolResult
- **Service implementation**: extends `ServiceClient`, declares methods/events/subscriptions

### Adding a New Service

1. Create `services/<name>/index.ts` extending `ServiceClient`
2. Declare methods, events, and subscriptions
3. Implement `handleMethod()` and `handleEvent()`
4. Add to `cli/gateway/start.ts` boot sequence
5. Add tests

## Configuration

All infrastructure settings live in `~/.vargos/config.json`. No `VARGOS_*` env vars needed at runtime.

```jsonc
{
  "agent": { "provider": "anthropic", "model": "claude-3-5-sonnet" },
  "gateway": { "port": 9000, "host": "127.0.0.1" },           // optional
  "mcp": { "transport": "http", "port": 9001, "endpoint": "/mcp" }, // optional
  "paths": { "dataDir": "~/.vargos", "workspace": "..." },     // optional
  "channels": { ... }                                           // optional
}
```

**Bootstrap fallback**: `VARGOS_DATA_DIR` env var is still checked to locate config.json before it's loaded. `${PROVIDER}_API_KEY` env vars override `agent.apiKey`. All other `VARGOS_*` env vars are replaced by config fields.

## Path Resolution

All paths in `core/config/paths.ts`:

```typescript
initPaths(config.paths)     // called at boot — locks in resolved paths
resolveDataDir()            // config.paths.dataDir || VARGOS_DATA_DIR || ~/.vargos
resolveWorkspaceDir()       // config.paths.workspace || $DATA_DIR/workspace
resolveSessionsDir()        // $DATA_DIR/sessions
resolveSessionFile(key)     // $DATA_DIR/sessions/<key>.jsonl
```

## Key Documents

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Coding guidance, workflow, conventions (this file) |
| `ARCHITECTURE.md` | Protocol spec, service contracts, message flows |

## Rules

- **Less code is better** — remove unused code, don't extend
- **No business logic in tools** — delegate to services
- **Services are isolated** — communicate only through gateway protocol
- **Docs stay current** — if code changes architecture, update the MDs
