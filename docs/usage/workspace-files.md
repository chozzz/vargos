# Workspace Files

Vargos seeds `~/.vargos/workspace/` from [`.templates/vargos/workspace/`](../../.templates/vargos/workspace/) on every startup. Markdown files directly under `workspace/` are refreshed from the bundled templates each time; other seeded files keep local edits. These files shape how the agent behaves, what it remembers, and how it responds.

For how they're injected into the system prompt, see [Runtime](./runtime.md).

## File reference

| File | Purpose | Injected into prompt? |
|---|---|---|
| **AGENTS.md** | Workspace rules: identity scoping, channel conventions, memory pipeline, boundaries. The agent's operating manual. | ✅ every session |
| **SOUL.md** | Personality, communication style, user profile (`Your Human` block). | ✅ every session |
| **TOOLS.md** | Environment-specific notes: project paths, device names, quick commands. | ✅ every session |
| **HEARTBEAT.md** | Periodic task list for the heartbeat cron. | ❌ read on demand by `~/.vargos/cron/heartbeat.md` |
| **MEMORY.md** | Long-term memory **index** — pointers to `memory/<topic>.md`, not content. Keep <50 lines. | ❌ tool-accessible (`memory.search`, `memory.read`) |

## Memory architecture

```
sessions (raw conversations)
    ↓ heartbeat curates
memory/YYYY-MM-DD.md (daily summaries)
    ↓ heartbeat promotes (>14 days)
memory/<topic>.md (curated topic files)
    ↓ indexed in
MEMORY.md (pointers only)
    ↓ retrieved via
memory.search / memory.read
```

**MEMORY.md is an index, not a store.** Content lives in `memory/<topic>.md`. The heartbeat cron promotes daily notes into topic files and keeps the index lean.

## Heartbeat

The heartbeat task runs as a normal cron task at `~/.vargos/cron/heartbeat.md` (seeded from [`.templates/vargos/cron/heartbeat.md`](../../.templates/vargos/cron/heartbeat.md)). Its prompt body points the agent at `${WORKSPACE_DIR}/HEARTBEAT.md` for the actual checklist.

When the agent finishes its run, replies of exactly `HEARTBEAT_OK` are pruned (no notification sent). Anything else gets delivered to the configured `notify` channels — but not injected into target session history (cron special-cases heartbeat to omit `fromSessionKey`, treating its outputs as ephemeral).

For broader cron behavior, see [Configuration](../configuration.md) and [`services/cron/index.ts`](../../services/cron/index.ts).

## Channel personas

Channel-specific behavior overrides live separately at `~/.vargos/agents/<channelId>.md` (not in workspace). See [Personas](./personas.md). They're the channel-scoped counterpart to workspace bootstrap.

## Skills

Skills are markdown files at `~/.vargos/agent/skills/<name>/SKILL.md` (auto-loaded by Pi SDK) and `~/.vargos/workspace/skills/<name>/SKILL.md` (added by Vargos). See [Skills](../extending/skills.md).

## Key design decisions

- **Only 3 files auto-inject** (AGENTS / SOUL / TOOLS). MEMORY.md and HEARTBEAT.md are tool-accessed.
- **Identity lives in SOUL.md.** Single source of truth.
- **TOOLS.md is environment-specific.** Project paths, devices, conventions.
- **Bootstrap files are truncated at 6K chars** (head/tail strategy in [`services/agent/index.ts`](../../services/agent/index.ts)). The agent can `read` full files on demand if needed.
