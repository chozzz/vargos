# Channel Personas

Per-channel system-prompt overrides at `~/.vargos/agents/<channelId>.md`. Implementation: [`services/agent/persona.ts`](../../services/agent/persona.ts). Template: [`.templates/agents/default.md`](../../.templates/agents/default.md).

## How it works

- At every startup, Vargos enumerates configured channels and ensures `~/.vargos/agents/<channelId>.md` exists. Missing files are seeded from `default.md`.
- When a session is created for a channel sessionKey, the persona is read **fresh from disk** (no in-memory cache) and applied:
  - Body is appended to the merged bootstrap (`AGENTS.md` + `SOUL.md` + `TOOLS.md`) in the system prompt.
  - Frontmatter `allowedTools` glob whitelist filters the bus tools exposed for that session.
- Subagent sessionKeys (`<parent>:subagent:<child>`) inherit the parent's persona — `parseSessionKey` strips the `:subagent:` suffix.
- Cron / CLI / webhook sessionKeys do **not** trigger persona loading.

## Frontmatter

| Field | Type | Effect |
|---|---|---|
| `allowedTools` | `string[]` (glob) | Whitelist of bus tools. Empty/missing = all allowed. Pi SDK built-ins (`read`/`bash`/`edit`/`write`/...) always available. |

Body content is appended verbatim to the system prompt.

## `allowedTools` glob syntax

| Pattern | Matches |
|---|---|
| `memory.*` | `memory.search`, `memory.read`, `memory.write`, `memory.stats` |
| `channel.send` | only `channel.send` (exact) |
| `mcp.atlassian.*` | every tool from the `atlassian` MCP server |
| `*` | all bus tools |

Matcher: [`lib/glob.ts`](../../lib/glob.ts) `matchesGlob`. Filter applied in [`services/agent/index.ts`](../../services/agent/index.ts) `getCustomTools`.

## Re-loading

Personas are re-read on every `getOrCreateSession`. Edit the file → next session creation picks it up. Currently-cached sessions keep their loaded persona until eviction or restart.

## Migrating from `instructionsFile`

The old `instructionsFile` channel-config field has been removed. If your `config.json` channels still set it:

1. Move the body of the referenced file into `~/.vargos/agents/<channelId>.md`.
2. Optionally add an `allowedTools` glob list at the top.
3. Remove the `instructionsFile` field from `config.json` (Zod silently strips it).

## See also

- [Channels](./channels.md) — channel adapter setup
- [Runtime](./runtime.md) — system prompt assembly order
