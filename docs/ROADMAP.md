# Roadmap

Planned features for Vargos. For shipped features, see [FEATURES.md](../FEATURES.md).

## Voice integration

Inbound and outbound voice support.

- Twilio phone channel adapter
- STT/TTS bridge (LocalAI or hosted)
- Transparent transcription of WhatsApp/Telegram voice notes
- Optional voice replies
- `phone_call(to, instructions, persona?)` tool — initiates Twilio call, spawns a subagent session for autonomous voice conversation, returns transcript
- Hospitality / concierge persona pack for caller-ID-driven sessions

## More channels

- **Slack** — Bolt SDK or Socket Mode + xoxb tokens. Single biggest gap.
- Discord, Signal, Matrix, Teams (lower priority)

## Web UI / Observability

The observability **console shipped** as the [`edge/web`](../edge/web/) service — it comes
up with the daemon (`vargos start` / `npx` / systemd), spawning the Next UI on `:9003` and
running its live-update WebSocket in-process on `:9004`. Dashboard, session/transcript
viewer, channels, cron, models, MCP, agents, memory, plus write actions (restart,
`cron.run`, `agent.execute`, `memory.reindex`). Source in [`web/`](../web/); see
[`web/README.md`](../web/README.md).

Still open:
- **Auth** — bearer-token gate like the MCP bridge (today it's localhost-only, unauthenticated).
- **Streaming deltas** — the console refetches on `fs_change`; per-run token/tool-call streaming would be tighter.
- **Cron editing** — `cron.add` / `cron.update` forms (the RPC allow-list already permits them).

## Session cost tracking

Token usage + cost per session / channel / cron task. Daily/weekly aggregation, budget alerts via channel notification.

## Media enhancements

- Image description fallback for non-vision models
- Image size limits + compression
- Document extraction parity for WhatsApp (currently Telegram-only)

## Agent enhancements

- Model switching mid-session
- Compaction config exposure
- Per-model/per-session thinking budget
- Session export/import

## Tighter loops

- File-watcher-driven persona reload (currently re-read on session creation; would benefit from cache invalidation on write)
- `bus.notify` for opt-in pub/sub patterns beyond the current `agent.on*` events

## Needs Discussion (proposals — do not implement before direction is given)

Proposed 2026-09-09 after running Nous Hermes alongside Vargos for a multi-channel
Telegram homelab migration. Each item: what Hermes has, the rough Vargos design,
and the open questions that need a decision.

### Terminal backends (SSH / Docker per channel)

> **Direction (2026-09-09):** the channel `cwd` value doubles as the terminal spec —
> a strict `ssh [-i KEY] [-p PORT] [user@]HOST[:PATH]` grammar, anything else stays a
> local path (existing configs untouched). The Pi SDK session keeps a **local** cwd
> (session files, skills, AGENTS.md discovery); built-in tools are rebuilt per session
> with the remote cwd + SSH operations (`BashOperations` etc. are exported by the SDK
> for exactly this — see pi's `examples/extensions/ssh.ts`), registered as custom tools
> that shadow the local built-ins in the session's tool registry — so the model's tool
> set is identical for local and remote sessions. Slices: (1) parser +
> `TerminalBackend` seam + local passthrough — **done** (`lib/terminal.ts` +
> `services/agent/terminal/`); (2) SSH backend (one multiplexed `ssh2` client per
> session, key auth, SFTP file ops, `client.exec` bash, SFTP-walk + minimatch find) —
> **done** (`services/agent/terminal/ssh.ts`); (3) session wiring in
> `getOrCreateSession` incl. subagent cwd inheritance — **done**; (4) remote grep —
> **done** (`services/agent/terminal/remote-grep.ts`: the SDK's grep has no pluggable
> exec — it always resolves a local `rg` — so a custom `grep` definition keeps the
> built-in schema/renderers and runs `rg` on the remote via the backend's bash ops,
> the same pattern pi's own gondolin example uses). Remaining:
> (5) Docker backend as a third `kind` in the same string slot.

Hermes routes a profile's shell + file tools (read/write/patch/search) through a
pluggable terminal backend (`local | docker | ssh | modal | ...`). The homelab case:
a Telegram bot whose *working machine* is not the gateway host.

Rough design: per-channel `terminal: { backend, host, user, key, cwd }` wrapping the
shell tool + file tools. One multiplexed SSH connection per channel (ControlMaster,
BatchMode, remote `$HOME` detection, remote `cwd`). Docker backend later for cheap
per-channel isolation.

Known gotcha (learned from Hermes): system-prompt build does git/context-file
detection that stats the configured cwd **on the gateway host** — must be made
backend-aware or skipped for remote backends, or turns crash with PermissionError
on remote-only paths (e.g. `/root/...` on a root-remote).

Open questions:
- Scope: SSH only first, or design the backend interface for Docker at the same time?
- Should file tools go over SSH, or keep read/write local and only shell remote?
- Env passthrough for tools that need host credentials (git, gh, npm)?
- Does this replace the separate-gateway-per-machine pattern (one vargos, many bots)
or complement it?

### Learning loop (post-session curator pass)

Hermes runs a background review after complex tasks: proposes new/updated skills
and MEMORY.md entries, staged for approval (`/skills pending` → approve/reject).

Rough design: background curator pass (cheap local model) over long/tool-heavy
sessions; reuse the existing `distill-jsonl-conversation` skill as the prompt
foundation; stage proposals in a pending store; approval via channel command and
web console.

Open questions:
- Trigger policy: on session end, size threshold, manual `/curate`, or cron sweep?
- Approval UX: in-chat commands, web console, or both? Default on/off?
- Should the curator also search pgvector for existing memories before proposing (dedupe)?

### Fallback provider chain

Hermes tries a `fallback_model` chain (per entry: provider + model) on 429/529/503/
connection failure; activation is one-shot per session.

Rough design: `models.json` / channel config gains `fallback: [provider/model, ...]`;
dispatch layer detects provider-class errors, advances the chain, logs the switch.

Open questions:
- Global default fallback, per-channel, or both?
- Should fallback respect per-channel model pins or be model-agnostic ("any local, then any cloud")?
- Announce the switch in-channel (e.g. "⚠️ falling back to anthropic/...")?

### Approval gates for unattended bots

Hermes has a command allowlist + write-approval gates (skill/memory writes staged,
dangerous terminal commands gated per policy).

Rough design: per-channel `approval: { writes: ask|off, commands: [allowlist],
dangerous: ask|off }` in the tool dispatch layer; approvals surfaced as channel
inline-keyboard buttons (Telegram) / web console.

Open questions:
- Which tools are "dangerous" by default (terminal write patterns? file writes outside cwd?)
- Timeout policy: auto-deny, auto-approve, or hang until answered?
- Should root-remote channels default stricter than local ones?

### Usage & cost analytics (`/usage`)

Extends the existing [Session cost tracking](#session-cost-tracking) section:
per-session token/cost rollups, a `/usage` channel command, web-console page,
and provider-actuals (which fallback fired, which model served each turn). Feeds
fallback decisions and the daily budget alerts.

Open questions:
- Local models: track tokens only, or assign synthetic costs per channel?
- Retention for per-turn rollups (sqlite table growth)?

### Trajectory export for CPT/SFT

Hermes ships batch trajectory generation + compression for training tool-calling
models. Vargos-native version: first-class `vargos export <session|channel|date-range>
→ clean CPT/SFT markdown` in the existing distill pipeline — making Vargos the data
generator for the homelab training loop (choz-vault).

Open questions:
- Output shapes: CPT markdown only, or also chat-completions JSONL for SFT?
- Filter criteria (min tool calls, success-only, per-channel persona tag)?
- Batch mode: sweep N days of all channels nightly via cron?

### Web console: embedded chat tab

Extends the [Web UI / Observability](#web-ui--observability) open items: a chat tab
that WS-attaches to a live channel/session so the console can be a client, not just
a monitor (Hermes' dashboard has this via its `[web,pty]` extras).

Open questions:
- Attach to existing sessions (share state with the channel's bot) or spawn console-owned sessions?
- Build on the current fs_change model or proper per-run streaming first (dependency?)?

## See also

- [FEATURES.md](../FEATURES.md) — what's shipped
