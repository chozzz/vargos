# Workspace Files

Vargos initializes a workspace directory (`~/.vargos/workspace/` by default) with context files on first run. These files shape how the agent behaves, what it remembers, and how it interacts with the user.

Templates live in `docs/templates/`. They're copied once on first boot — after that, the agent reads exclusively from the workspace directory. Users edit the workspace copies; templates serve as reference only.

## File Reference

### AGENTS.md

**Purpose:** Workspace rules and operating procedures.

Defines what the agent should do at the start of every session (read SOUL.md, USER.md, recent memory), how to handle memory persistence, safety boundaries, when to speak vs stay silent, and how to use tools. This is the agent's operating manual.

**Injected:** Every session (full mode). Subagents receive it too (minimal mode).

### SOUL.md

**Purpose:** Personality and identity.

Defines the agent's character — tone, values, boundaries, and communication style. The agent is expected to embody this persona. If SOUL.md is present, the prompt builder adds a hint: "embody its persona."

The agent owns this file and can evolve it over time, but should notify the user when it changes.

**Injected:** Full mode sessions only.

### USER.md

**Purpose:** Profile of the human the agent serves.

Contains the user's name, preferred name, pronouns, timezone, and communication preferences. The agent reads this to personalize interactions.

**Injected:** Full mode sessions only.

### TOOLS.md

**Purpose:** Environment-specific notes.

A scratchpad for device names, SSH hosts, camera locations, voice preferences — anything specific to the user's local setup that tools need to reference. Keeps environment details separate from tool definitions.

**Injected:** Every session (full and minimal mode).

### MEMORY.md

**Purpose:** Curated long-term memory.

The agent's persistent memory across sessions. Contains important decisions, lessons learned, people, and context that should survive restarts. The agent updates this as it learns.

Security rule: only loaded in main (direct) sessions, never in shared/group contexts.

**Injected:** Full mode sessions only.

### HEARTBEAT.md

**Purpose:** Periodic task list for the heartbeat cron.

When heartbeat is enabled (`config.heartbeat.enabled`), the agent receives periodic polls. On each poll, it reads this file for pending tasks. If nothing needs attention, it responds with `HEARTBEAT_OK`. Users add maintenance tasks, growth goals, or monitoring checks here.

**Injected:** Full mode sessions only. Also read by the agent during heartbeat poll execution.

### BOOTSTRAP.md

**Purpose:** First-run instructions.

A one-time checklist the agent follows on its very first session: read SOUL.md, read USER.md, read AGENTS.md, then delete the file. Only injected when no other bootstrap files exist yet.

**Injected:** First run only (when no other context files exist).

## Prompt Injection Order

The prompt builder (`src/runtime/prompt.ts`) injects files in this order:

1. ARCHITECTURE.md (if present — not a template, project-specific)
2. AGENTS.md
3. SOUL.md
4. TOOLS.md
5. USER.md
6. HEARTBEAT.md
7. MEMORY.md
8. BOOTSTRAP.md (first run only)

Files larger than 20,000 characters are truncated using a 70/20 head/tail strategy — the middle is dropped to preserve both the beginning and end.

## Prompt Modes

| Mode | Files Injected | Used By |
|------|---------------|---------|
| `full` | All files | Main sessions (CLI, channels) |
| `minimal` | AGENTS.md, TOOLS.md only | Subagents, cron jobs |
| `none` | None | Bare "helpful assistant" fallback |
