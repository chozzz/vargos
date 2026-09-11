# Configuration

Vargos splits config across **five files** under `~/.vargos/`. The split keeps secrets isolated and aligns with Pi SDK's structure.

| File | Purpose | Schema |
|---|---|---|
| `config.json` | App config: channels, cron, webhooks, gateway | [`services/config/index.ts`](../services/config/index.ts) `AppConfigSchema` |
| `agent/mcp.json` | External MCP servers (shared with Pi SDK) | See [MCP](#mcp) |
| `agent/models.json` | Provider definitions and model registry (Pi SDK owned) | [Pi SDK `ModelRegistry`](../node_modules/@earendil-works/pi-coding-agent/dist/core/model-registry.d.ts) |
| `agent/settings.json` | Default model, thinking level, media providers | Pi SDK `SettingsManager` |
| `agent/auth.json` | Provider API keys + OAuth tokens | Pi SDK `AuthStorage` |

All four are `0o600` (owner-only). The config service merges them at runtime. Override the data dir: `VARGOS_DATA_DIR=/some/path`.

## Channels

Each entry in `config.json#channels[]` matches [`services/config/schemas/channels.ts`](../services/config/schemas/channels.ts). Keys: `type` (`telegram` | `whatsapp`), `id` (unique instance id, used as sessionKey prefix), `enabled`, `model?` (per-channel override), `cwd?`, `debounceMs?`, `allowFrom?` (whitelist), plus `botToken` for telegram.

**`cwd` — terminal backend spec.** A plain path is the session's local working directory. The value also accepts an SSH terminal spec to route the session's shell + file tools (bash/read/write/edit/find/ls) to a remote host:

```json
"cwd": "ssh -i ~/.ssh/id_remote root@192.0.2.10:/root/dev/myapp"
```

Grammar: `ssh [-i KEY] [-p PORT] [user@]HOST[:PATH]` (port only via `-p`; no PATH → remote `$HOME`; `~` in KEY expands locally, remote `~` resolves on the host). Key auth only (BatchMode — no password prompts). The daemon keeps a multiplexed `ssh2` connection per remote session (SFTP for file ops, exec for bash/grep); sessions, skills, and AGENTS.md loading stay local on the gateway, and the model's tool set (read/bash/edit/write/find/ls/grep) is identical to a local session's — only the execution host differs. See [ROADMAP — Terminal backends](./ROADMAP.md#terminal-backends-ssh--docker-per-channel).

The old `instructionsFile` field has been removed — channel system-prompt overrides live in [persona files](./usage.md) at `~/.vargos/agents/<id>.md`.

## Cron tasks

File-based, one task per markdown file at `~/.vargos/cron/<id>.md`. Frontmatter schema: [`services/config/schemas/cron.ts`](../services/config/schemas/cron.ts). Body is the prompt the agent runs. Notify outputs are sent via `channel.send` with `fromSessionKey` so target session history records the source.

The bundled `heartbeat` task is the canonical example — see [`.templates/cron/heartbeat.md`](../.templates/cron/heartbeat.md).

## Interpolation variables

Available in any prompt string (cron task body, persona body, system-prompt fragments). Defined in [`services/agent/prompt-interpolate.ts`](../services/agent/prompt-interpolate.ts).

| Group | Variables |
|---|---|
| **Paths** | `${WORKSPACE_DIR}`, `${DATA_DIR}`, `${SESSIONS_DIR}`, `${CRON_DIR}`, `${CACHE_DIR}`, `${LOGS_DIR}`, `${CHANNELS_DIR}`, `${HOME}`, `${PWD}` |
| **Time** | `${CURRENT_DATE}`, `${CURRENT_TIMEZONE}` |
| **Session** | `${SESSION_KEY}` |
| **Documentation placeholders** | `${PROVIDER}`, `${VAR}` (empty — for referencing patterns like `${PROVIDER}_API_KEY`) |

Default-value syntax: `${VAR:-fallback}`. Used when `VAR` is missing or empty.

## Models, providers, auth

`agent/models.json` registers providers and their models for Pi SDK's `ModelRegistry`. `agent/settings.json` sets `defaultProvider` + `defaultModel` (must match the registry id **exactly** — Pi does an exact `find()` and falls through to first-available on miss).

`agent/auth.json` holds API keys and OAuth tokens. Env override: `${PROVIDER}_API_KEY` (e.g. `ANTHROPIC_API_KEY`) takes precedence.

To run Pi CLI against the same config: `pnpm chat` (sets `PI_CODING_AGENT_DIR` and `--session-dir` automatically).

## MCP

External MCP servers are configured in `~/.vargos/agent/mcp.json`, which is shared between Vargos (`pnpm start`) and Pi SDK CLI (`pnpm chat`). See [MCP documentation](./usage.md) for examples and setup.

Tools are namespaced as `mcp.<server>.<tool>` on the bus when the Vargos server is running.

The MCP **server** (Vargos exposing itself as an MCP server) lives in [`edge/mcp/`](../edge/mcp/) and is currently commented out in [`index.ts`](../index.ts).

## Webhooks

Configured under `webhooks[]` in `config.json`. Receiver lives in [`edge/webhooks/`](../edge/webhooks/); inbound flow is `POST /hooks/:id` → auth → transform → agent run → optional `notify` delivery.

| Field | Type | Notes |
|---|---|---|
| `id` | string | URL segment (`/hooks/:id`) and session key (`webhook:<id>:<ms>`) |
| `name` | string | Display name |
| `token` | string | **Optional.** When set, requests must send `Authorization: Bearer <token>` (timing-safe compared). When omitted, auth is bypassed — any client that can reach the port can fire the hook — and the daemon logs a warning at boot. |
| `transform` | string | Optional path to a JS/TS transform file |
| `notify` | string[] | Optional session keys to deliver the response to via `channel.send` |

## See also

- [Channels](./usage.md)
- [Personas](./usage.md)
- [Architecture](./architecture.md)
