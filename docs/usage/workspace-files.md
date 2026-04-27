# Workspace Files

Vargos initializes a workspace directory (`~/.vargos/workspace/` by default) with context files on first run. These files shape how the agent behaves, what it remembers, and how it interacts with the user. For how these files are injected into the system prompt, see [runtime.md](./runtime.md).

Templates live in `.templates/vargos/workspace/`. They're copied once on first boot — after that, the agent reads exclusively from the workspace directory. Users edit the workspace copies; templates serve as reference only.

## File Reference

| File | Purpose | Injected |
|------|---------|----------|
| **AGENTS.md** | Workspace rules: self-awareness, context discovery protocol, memory conventions, external-vs-internal policy. The agent's operating manual. | Every session (full + minimal). |
| **SOUL.md** | Identity, personality, boundaries, user profile. Agent embodies this persona. Contains the "Your Human" section (name, timezone, preferences). | Every session (full + minimal). |
| **TOOLS.md** | Environment-specific notes: project paths, device names, SSH hosts, service IPs, quick commands. The agent's cheat sheet for finding things without asking. | Every session (full + minimal). |
| **HEARTBEAT.md** | Periodic task list for heartbeat cron. Split into `## Tasks` (executable) and `## Notes` (advisory). Empty or comment-only = heartbeat skipped. | Not injected. Read by heartbeat cron. |
| **MEMORY.md** | Long-term memory **index**. Contains pointers to `memory/<topic>.md` files, not content itself. Should stay under 50 lines. | Not injected. Tool-accessible. |

### Removed Files

- **USER.md** — Merged into SOUL.md's "Your Human" section.
- **BOOTSTRAP.md** — Removed. First-run onboarding is handled by the setup wizard.

## Memory Architecture

```
sessions (raw conversations)
    ↓ heartbeat
memory/YYYY-MM-DD.md (daily summaries)
    ↓ heartbeat curation (>14 days old)
memory/<topic>.md (curated topic files)
    ↓ indexed in
MEMORY.md (pointers only, <50 lines)
    ↓ retrieved via
memory_search / memory_get (agent tools)
```

**Key principle:** MEMORY.md is an index, not a store. Detailed content lives in topic files under `memory/`. The heartbeat cron promotes daily notes into topic files and keeps the index lean.

## Context Discovery

AGENTS.md includes a "Context Discovery" protocol that teaches the agent to find information before asking the user:

1. **Sessions** — `sessions_list` + `sessions_history` for conversation history
2. **Memory** — `memory_search` + `read` for workspace knowledge
3. **Filesystem** — project paths from TOOLS.md, explored via `exec`
4. **Web** — `web_fetch` or `browser` for external context

This prevents the common failure mode where the agent asks the user for context it could find itself (e.g., "where is the vaditaslim repo?" when it's listed in TOOLS.md, or "I can't access WhatsApp" when sessions are stored locally).

## Heartbeat Flow

The heartbeat is a periodic cron task that polls the agent to perform maintenance. It runs on a separate config key (`config.heartbeat`), not inside `cron.tasks` — it's registered as an ephemeral cron job at boot via `createHeartbeatTask()`.

### Config

```jsonc
{
  "heartbeat": {
    "enabled": true,
    "intervalMinutes": 30,
    "notify": ["whatsapp:+1234567890"],  // optional: deliver results to channel
    "activeHours": [8, 22],
    "activeHoursTimezone": "Australia/Sydney"
  }
}
```

### Skip conditions

Every tick, three checks run before the agent is invoked:

1. **Active hours** — outside the configured window → skip
2. **Agent busy** — another run is in progress → skip
3. **HEARTBEAT.md empty** — no actionable tasks (only headers/comments) → skip

This means heartbeat costs zero API calls when there's nothing to do.

### Example flow

```
:30 — Cron fires heartbeat
       ├─ Active hours? Yes (14:30 Sydney)
       ├─ Agent busy? No
       └─ HEARTBEAT.md has tasks? Yes
           → Agent run starts with prompt:
             "Heartbeat poll. Read HEARTBEAT.md for your checklist."

       Agent reads HEARTBEAT.md:
         - Write today's daily summary
         - Curate memory: promote old dailies, prune stale pointers

       Agent writes memory/2026-03-13.md, promotes old dailies,
       updates MEMORY.md index.

       Agent responds: HEARTBEAT_OK
       → Transcript pruned (last 2 messages removed from cron session)
       → No notification sent (HEARTBEAT_OK = no-op)

:00 — Cron fires heartbeat
       ├─ HEARTBEAT.md has tasks? Yes (same checklist)
       ├─ Agent reads HEARTBEAT.md, checks daily already written
       └─ Nothing to do → responds: HEARTBEAT_OK
       → Pruned, no notification

       (If the agent finds something actionable — e.g. stale bootstrap
        file — it reports the finding instead of HEARTBEAT_OK.
        That response is delivered to notify targets.)
```

### Architecture split

- **AGENTS.md** = permanent knowledge (HOW to do memory maintenance, bootstrap hygiene, etc.)
- **HEARTBEAT.md** = ephemeral task queue (WHAT to check this cycle)

The agent reads HEARTBEAT.md each poll and follows AGENTS.md for procedures. Users edit HEARTBEAT.md to add/remove tasks; the agent never modifies it.

## Key Design Decisions

- **Only 3 files are auto-injected** (AGENTS, SOUL, TOOLS). MEMORY.md and HEARTBEAT.md are accessed on-demand — memory via `memory_search` tools, heartbeat via the cron task reading the file directly.
- **Identity is delegated to SOUL.md.** Single source of truth, no conflicts.
- **MEMORY.md is an index.** Content lives in `memory/<topic>.md` topic files. This prevents MEMORY.md from bloating.
- **TOOLS.md includes project paths.** The agent can resolve project names to filesystem paths without asking the user.
- **Keep bootstrap files lean.** Bootstrap files are truncated at 6,000 chars; the agent can `read` full files on demand if needed.
