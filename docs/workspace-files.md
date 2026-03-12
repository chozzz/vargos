# Workspace Files

Vargos initializes a workspace directory (`~/.vargos/workspace/` by default) with context files on first run. These files shape how the agent behaves, what it remembers, and how it interacts with the user.

Templates live in `docs/templates/`. They're copied once on first boot — after that, the agent reads exclusively from the workspace directory. Users edit the workspace copies; templates serve as reference only.

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

## Prompt Injection Order

The prompt builder (`src/agent/prompt.ts`) injects bootstrap files in this order:

| Order | File |
|-------|------|
| 1 | AGENTS.md |
| 2 | SOUL.md |
| 3 | TOOLS.md |

Files larger than 6,000 characters are truncated using a 70/20 head/tail strategy — the middle is dropped to preserve both the beginning and end. Keep bootstrap files lean; the agent can `read` full files on demand.

## Prompt Modes

| Mode | Bootstrap Files | Other Sections | Used By |
|------|----------------|----------------|---------|
| `full` | All 3 files | Identity, Tooling, Workspace, Codebase Context, Orchestration, Memory Recall, Heartbeat, Tool Narration, Channel, System | Main sessions (CLI, channels) |
| `minimal` | All 3 files | Identity, Tooling, Workspace, Heartbeat, System | Cron jobs |
| `minimal-subagent` | All 3 files | Identity, Tooling, Workspace, System | Sub-agent sessions |
| `none` | None | "You are a helpful assistant." | Bare fallback |

## Key Design Decisions

- **Only 3 files are auto-injected** (AGENTS, SOUL, TOOLS). MEMORY.md and HEARTBEAT.md are accessed on-demand — memory via `memory_search` tools, heartbeat via the cron task reading the file directly.
- **Identity is delegated to SOUL.md.** The hardcoded identity section says "Your name and personality are defined in SOUL.md" — single source of truth, no conflicts.
- **Bootstrap files load in all modes.** The same 3 lean files load in both full and minimal mode for consistent behavior.
- **MEMORY.md is an index.** Content lives in `memory/<topic>.md` topic files. This prevents MEMORY.md from bloating (which happened when it stored full competitive analyses and architecture reviews inline).
- **TOOLS.md includes project paths.** The agent can resolve project names to filesystem paths without asking the user.
- **Built-in tools are not listed in the prompt.** Tool schemas are sent via the API tools field. Only MCP external tools are listed in the prompt for server grouping context.
- **Channel rules use sandwich pattern.** For channel sessions, critical rules appear in both the `## Channel` section and a `## Reminder` section at the very end of the prompt. Research shows LLMs attend best to the start and end of long prompts (primacy + recency), so the most-violated rules get recency reinforcement.
- **Markdown is stripped deterministically.** Outbound channel messages pass through `stripMarkdown()` as a safety net, regardless of how well the model follows the plain-text instruction.
