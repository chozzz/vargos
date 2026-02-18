# Workspace Files

Vargos initializes a workspace directory (`~/.vargos/workspace/` by default) with context files on first run. These files shape how the agent behaves, what it remembers, and how it interacts with the user.

Templates live in `docs/templates/`. They're copied once on first boot — after that, the agent reads exclusively from the workspace directory. Users edit the workspace copies; templates serve as reference only.

## File Reference

| File | Purpose | Injected |
|------|---------|----------|
| **AGENTS.md** | Workspace rules and operating procedures: what to do at session start (read SOUL.md, USER.md, recent memory), memory persistence, safety boundaries, when to speak vs stay silent, tool usage. The agent's operating manual. | Every session (full mode). Subagents too (minimal mode). |
| **SOUL.md** | Personality and identity — tone, values, boundaries, communication style. Agent embodies this persona; prompt builder adds "embody its persona" when present. Agent may evolve it but should notify the user on changes. | Full mode only. |
| **USER.md** | Profile of the human: name, preferred name, pronouns, timezone, communication preferences. Used to personalize interactions. | Full mode only. |
| **TOOLS.md** | Environment-specific notes: device names, SSH hosts, camera locations, voice preferences — anything tools need for the local setup. Keeps env details separate from tool definitions. | Every session (full and minimal). |
| **MEMORY.md** | Curated long-term memory across sessions: decisions, lessons, people, context that survives restarts. Agent updates as it learns. Security: only in main (direct) sessions, never shared/group. | Full mode only. |
| **HEARTBEAT.md** | Periodic task list for heartbeat cron. When `config.heartbeat.enabled`, agent is polled and reads this for pending tasks; responds `HEARTBEAT_OK` if nothing to do. For maintenance, growth goals, monitoring. | Full mode only; also read during heartbeat poll. |
| **BOOTSTRAP.md** | First-run checklist: read SOUL.md, USER.md, AGENTS.md, then delete. One-time only. | First run only (when no other context files exist). |

## Prompt Injection Order

The prompt builder (`src/runtime/prompt.ts`) injects files in this order:

| Order | File | Note |
|-------|------|------|
| 1 | ARCHITECTURE.md | If present — not a template, project-specific |
| 2 | AGENTS.md | |
| 3 | SOUL.md | |
| 4 | TOOLS.md | |
| 5 | USER.md | |
| 6 | HEARTBEAT.md | |
| 7 | MEMORY.md | |
| 8 | BOOTSTRAP.md | First run only |

Files larger than 20,000 characters are truncated using a 70/20 head/tail strategy — the middle is dropped to preserve both the beginning and end.

## Prompt Modes

| Mode | Files Injected | Used By |
|------|----------------|---------|
| `full` | All files | Main sessions (CLI, channels) |
| `minimal` | AGENTS.md, TOOLS.md only | Subagents, cron jobs |
| `none` | None | Bare "helpful assistant" fallback |
