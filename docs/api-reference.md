# API Reference

Complete bus event reference. **Source of truth: [`gateway/events.ts`](../gateway/events.ts)** — read it for the exact param/result shapes.

The bus carries two shapes:
- **Pure events** — flat payload, fire-and-forget. Use `bus.emit` and `@on`.
- **Callable events** — `{ params, result }`. Use `bus.call` (request/reply) and `@register`.

Every `@register`-ed callable is auto-exposed as an agent tool by `services/agent/tools.ts:wrapEventAsToolDefinition`. The agent calls them by name; `sessionKey` is auto-injected.

## Pure events

| Event | Emitter |
|---|---|
| `log.onLog` | every `createLogger(service)` |
| `agent.onDelta` | streaming LLM tokens |
| `agent.onTool` | tool start/end during a run |
| `agent.onCompleted` | run finished — `success: true \| false` |
| `channel.onConnected` / `channel.onDisconnected` | adapter lifecycle |
| `bus.onReady` | all services bootstrapped |

## Callable events

| Event | What it does |
|---|---|
| `config.get` / `config.set` | Read/write the merged `AppConfig` |
| `agent.execute` | Run a turn. Throws on Pi SDK `stopReason === 'error'`. |
| `agent.appendMessage` | Append text to a session JSONL without running the agent |
| `agent.status` | Currently active runs |
| `media.transcribeAudio` / `describeImage` / `extractDocument` | Whisper / vision / PDF-DOCX-XLSX-TXT-MD extraction |
| `web.fetch` | HTTP → markdown extraction |
| `channel.send` | Send to a channel. With `fromSessionKey`, also injects `[fromSessionKey] text` into target session history. |
| `channel.sendMedia` / `channel.search` / `channel.get` / `channel.register` | Channel CRUD + media |
| `cron.search` / `cron.add` / `cron.update` / `cron.remove` / `cron.run` | Cron task CRUD + manual fire |
| `webhook.search` | Webhook introspection (receiver `edge/webhooks/` is currently disabled at boot) |
| `memory.search` / `memory.read` / `memory.write` / `memory.stats` | Memory operations |
| `log.search` | Query persisted error log |
| `bus.search` / `bus.inspect` | Discover registered events |

## Calling from outside

The TCP server listens on `127.0.0.1:9000` (configurable via `gateway.host` / `gateway.port`). It speaks **JSON-RPC 2.0 over raw TCP**, not HTTP:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"bus.search","params":{}}' | nc -q 1 127.0.0.1 9000
```

The MCP bridge at `edge/mcp/` exposes the same surface over HTTP, but is currently commented out in `index.ts`.

## See also

- [`gateway/events.ts`](../gateway/events.ts) — typed `EventMap` (the contract)
- [`services/agent/tools.ts`](../services/agent/tools.ts) — how callables become agent tools
- [Configuration](./configuration.md) — `AppConfig` shape
- [Sessions](./usage/sessions.md) — sessionKey formats
