# Workspace Files

Vargos initializes a workspace directory (`~/.vargos/workspace/` by default) with context files on first run. These files shape how the agent behaves, what it remembers, and how it interacts with the user.

Templates live in `docs/templates/`. They're copied once on first boot — after that, the agent reads exclusively from the workspace directory. Users edit the workspace copies; templates serve as reference only.

## File Reference

| File | Purpose | Injected |
|------|---------|----------|
| **AGENTS.md** | Workspace rules: session start protocol, memory conventions, external-vs-internal policy, communication etiquette. The agent's operating manual. | Every session (full + minimal). |
| **SOUL.md** | Identity, personality, boundaries, user profile. Agent embodies this persona. Contains the "Your Human" section (name, timezone, preferences) — previously in USER.md. | Every session (full + minimal). |
| **TOOLS.md** | Environment-specific notes: device names, SSH hosts, service IPs, quick commands. Keeps env details separate from tool definitions. | Every session (full + minimal). |
| **HEARTBEAT.md** | Periodic task list for heartbeat cron. Split into `## Tasks` (executable) and `## Notes` (advisory). Empty or comment-only = heartbeat skipped. | Not injected. Read by heartbeat cron. |
| **MEMORY.md** | Curated long-term memory. Agent retrieves via `memory_search` / `memory_get` when needed. | Not injected. Tool-accessible. |

### Removed Files

- **USER.md** — Merged into SOUL.md's "Your Human" section. One file for the complete agent-user relationship.
- **BOOTSTRAP.md** — Removed. First-run onboarding is handled by the setup wizard, not a self-deleting file.
- **ARCHITECTURE.md** — Never existed as a template. Codebase context is handled by `buildCodebaseContextSection()` in prompt.ts.

## Prompt Injection Order

The prompt builder (`src/agent/prompt.ts`) injects bootstrap files in this order:

| Order | File |
|-------|------|
| 1 | AGENTS.md |
| 2 | SOUL.md |
| 3 | TOOLS.md |

Files larger than 20,000 characters are truncated using a 70/20 head/tail strategy — the middle is dropped to preserve both the beginning and end.

## Prompt Modes

| Mode | Bootstrap Files | Other Sections | Used By |
|------|----------------|----------------|---------|
| `full` | All 4 files | Identity, Tooling, Workspace, Codebase Context, Memory Recall, Heartbeat, Tool Narration, Channel, System | Main sessions (CLI, channels) |
| `minimal` | All 4 files | Identity, Tooling, Workspace, Heartbeat, System | Cron jobs, subagents |
| `none` | None | "You are a helpful assistant." | Bare fallback |

## Key Design Decisions

- **Only 3 files are auto-injected** (AGENTS, SOUL, TOOLS). MEMORY.md and HEARTBEAT.md are accessed on-demand — memory via `memory_search` tools, heartbeat via the cron task reading the file directly.
- **Identity is delegated to SOUL.md.** The hardcoded identity section says "Your name and personality are defined in SOUL.md" — single source of truth, no conflicts.
- **Bootstrap files load in all modes.** The same 3 lean files load in both full and minimal mode for consistent behavior.
