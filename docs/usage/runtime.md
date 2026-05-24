# Runtime

How `agent.execute` runs a turn. Implementation: [`services/agent/index.ts`](../../services/agent/index.ts).

## Boot order

```
config → log → web → memory → media → agent → channels → cron → mcp-client → tcp server → bus.onReady
```

Defined in [`index.ts`](../../index.ts). `edge/mcp/` (MCP server) and `edge/webhooks/` exist in code but are commented out at boot.

Templates seed first: `seedDataDir(log)` runs before any service boots, recursively copying missing files from [`.templates/`](../../.templates/) into `~/.vargos/`. Copy-missing only — user edits are always preserved. See [`lib/templates.ts`](../../lib/templates.ts).

## Execution flow

`agent.execute` →
1. Parse directives (`/think:`, `/verbose`)
2. `getOrCreateSession(sessionKey, metadata)` — load or create the Pi SDK `AgentSession`
3. `loadPersonaIfChannel(sessionKey)` — channel sessionKeys only
4. `getCustomTools(sessionKey, persona.allowedTools?)` — bus tools, glob-filtered
5. `getSystemPrompt(sessionKey, metadata, persona.body?)` — assemble + interpolate
6. `session.prompt(task, { streamingBehavior: 'steer' })` — Pi SDK runs the turn
7. `extractFinalAssistant(session)` — read final message, surface inference errors

Streaming events flow through `subscribeToSessionEvents` → `agent.onDelta` / `agent.onTool` / `agent.onCompleted` on the bus.

## System prompt assembly

In order:

1. **Pi SDK base prompt** — built-in agent instructions.
2. **Pi SDK skills metadata** — `<available_skills>` block (name + description + location only). Skill bodies are read on demand via the `read` tool (Anthropic's progressive-disclosure pattern). Discovery roots: see [Skills](../extending/skills.md).
3. **Pi SDK context files** — auto-walked from `cwd`: `AGENTS.md` or `CLAUDE.md` per ancestor directory. Rendered as `# Project Context`.
4. **Vargos bootstrap files** — `AGENTS.md`, `SOUL.md`, `TOOLS.md` from `<workspaceDir>` and `<cwd>`. Each head/tail-truncated at 6K chars. `CLAUDE.md` is intentionally **not** in this list — Pi SDK handles it via step 3.
5. **Channel persona body** — content of `~/.vargos/agents/<channelId>.md` (see [Personas](./personas.md)).
6. **Interpolation** — every `${VAR}` and `${VAR:-default}` replaced. Variables: see [Configuration](../configuration.md#interpolation-variables).

## Tools available to the agent

- **Pi SDK built-ins** (always): `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`.
- **Bus tools** — every `@register`-ed callable across services, wrapped by [`services/agent/tools.ts`](../../services/agent/tools.ts).
- **MCP client tools** — external MCP servers from `mcpServers` config, namespaced `mcp.<server>.<tool>`.
- **Persona filter** — channel persona's `allowedTools` glob whitelist filters the bus + MCP list. Built-ins always pass through.

## Session caching

Sessions are cached in-memory by `sessionKey`. They stay alive after `agent_end` for follow-up messages. Pi SDK persists each turn to `~/.vargos/sessions/<sessionKey-with-/>/<timestamp>_<uuid>.jsonl`. On restart, the next call for that sessionKey loads history from disk.

## Inference error surfacing

Pi SDK records LLM call failures (e.g. expired API key) as an assistant message with empty `content` and `stopReason === 'error'` + `errorMessage`. Vargos detects this:
- `agent.execute` **throws** with the underlying error message.
- `agent.onCompleted` emits `success: false, error`.
- Channel pipeline catches and sends `Error: <msg>` back to the user.

## Subagents

`agent.execute` is itself a registered tool. The agent calls it on a child sessionKey (`<parent>:subagent:<child>`) to delegate work. Parent's persona is inherited — `parseSessionKey` strips the `:subagent:` suffix.

## See also

- [Sessions](./sessions.md) — sessionKey shapes and storage layout
- [Personas](./personas.md) — per-channel system prompt + tool whitelist
- [API Reference](../api-reference.md) — `agent.execute` params + events
- [`services/agent/index.ts`](../../services/agent/index.ts) — source of truth
