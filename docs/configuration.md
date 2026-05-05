# Configuration

Vargos splits config across **four files** under `~/.vargos/`. The split keeps secrets isolated and lets the config service patch each file independently.

| File | Purpose | Schema |
|---|---|---|
| `config.json` | App config: channels, cron, webhooks, MCP, gateway | [`services/config/index.ts`](../services/config/index.ts) `AppConfigSchema` |
| `agent/models.json` | Provider definitions and model registry (Pi SDK owned) | [Pi SDK `ModelRegistry`](../node_modules/@mariozechner/pi-coding-agent/dist/core/model-registry.d.ts) |
| `agent/settings.json` | Default model, thinking level, media providers | Pi SDK `SettingsManager` |
| `agent/auth.json` | Provider API keys + OAuth tokens | Pi SDK `AuthStorage` |

All four are `0o600` (owner-only). The config service merges them at runtime. Override the data dir: `VARGOS_DATA_DIR=/some/path`.

## Channels

Each entry in `config.json#channels[]` matches [`services/config/schemas/channels.ts`](../services/config/schemas/channels.ts). Keys: `type` (`telegram` | `whatsapp`), `id` (unique instance id, used as sessionKey prefix), `enabled`, `model?` (per-channel override), `cwd?`, `debounceMs?`, `allowFrom?` (whitelist), plus `botToken` for telegram.

The old `instructionsFile` field has been removed — channel system-prompt overrides live in [persona files](./usage/personas.md) at `~/.vargos/agents/<id>.md`.

## Cron tasks

File-based, one task per markdown file at `~/.vargos/cron/<id>.md`. Frontmatter schema: [`services/config/schemas/cron.ts`](../services/config/schemas/cron.ts). Body is the prompt the agent runs. Notify outputs are sent via `channel.send` with `fromSessionKey` so target session history records the source.

The bundled `heartbeat` task is the canonical example — see [`.templates/vargos/cron/heartbeat.md`](../.templates/vargos/cron/heartbeat.md).

## Interpolation variables

Available in any prompt string (cron task body, persona body, system-prompt fragments). Defined in [`services/agent/prompt-interpolate.ts`](../services/agent/prompt-interpolate.ts).

| Group | Variables |
|---|---|
| **Paths** | `${WORKSPACE_DIR}`, `${DATA_DIR}`, `${SESSIONS_DIR}`, `${CRON_DIR}`, `${CACHE_DIR}`, `${LOGS_DIR}`, `${CHANNELS_DIR}`, `${HOME}`, `${PWD}` |
| **Time** | `${CURRENT_DATE}`, `${CURRENT_TIMEZONE}` |
| **Session** | `${SESSION_KEY}`, `${CHANNEL_ID}`, `${CHANNEL_TYPE}`, `${CHAT_ID}` |
| **Sender** | `${USER_ID}`, `${USER_NAME}`, `${USER_HANDLE}` |
| **Bot** | `${BOT_ID}`, `${BOT_NAME}`, `${BOT_HANDLE}` |

Default-value syntax: `${VAR:-fallback}`. Used when `VAR` is missing or empty.

`USER_ID` is the **sender's platform ID**; `CHAT_ID` is the **session's chat id** parsed from sessionKey. For private chats they're the same value; for groups they differ.

## Models, providers, auth

`agent/models.json` registers providers and their models for Pi SDK's `ModelRegistry`. `agent/settings.json` sets `defaultProvider` + `defaultModel` (must match the registry id **exactly** — Pi does an exact `find()` and falls through to first-available on miss).

`agent/auth.json` holds API keys and OAuth tokens. Env override: `${PROVIDER}_API_KEY` (e.g. `ANTHROPIC_API_KEY`) takes precedence.

To run Pi CLI against the same config: `pnpm cli` (sets `PI_CODING_AGENT_DIR` and `--session-dir` automatically).

## MCP

External MCP servers live under `mcpServers` in `config.json`, loaded by [`services/mcp-client/`](../services/mcp-client/). Tools are namespaced as `mcp.<server>.<tool>` on the bus.

The MCP **server** (Vargos exposing itself as an MCP server) lives in [`edge/mcp/`](../edge/mcp/) and is currently commented out in [`index.ts`](../index.ts).

## Webhooks

Configured under `webhooks[]` in `config.json`. Receiver lives in [`edge/webhooks/`](../edge/webhooks/) and is currently commented out in `index.ts` — only `webhook.search` introspection is registered.

## See also

- [Channels](./usage/channels.md)
- [Personas](./usage/personas.md)
- [API Reference](./api-reference.md)
