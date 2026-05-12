# Skills

Skills are markdown files with YAML frontmatter that the agent loads on demand. Vargos uses Pi SDK's skills format and discovery — there's no Vargos-specific skill schema.

The bundled `skill-creator` skill (at [`.templates/vargos/agent/skills/skill-creator/SKILL.md`](../../.templates/vargos/agent/skills/skill-creator/SKILL.md), seeded into `~/.vargos/agent/skills/`) is the canonical reference. Read it for full guidance on writing effective skills.

## File shape

A skill is a directory containing at minimum `SKILL.md`. Optional siblings: `scripts/` (executables), `references/` (loaded on demand), `assets/` (output templates).

`SKILL.md` frontmatter only needs `name` and `description`. Other fields are ignored by Pi SDK. The description is the trigger — write it to convey both **what the skill does** and **when to use it**.

## Discovery paths

Pi SDK auto-loads skills from:
- `<agentDir>/skills/` — `~/.vargos/agent/skills/` (user-edited + bundled defaults)
- `<cwd>/.pi/skills/` — Pi SDK convention for project-local skills

Vargos's [`lib/skills.ts`](../../lib/skills.ts) `resolveSkillPaths()` adds two more roots via Pi SDK's `additionalSkillPaths`:
- `<workspaceDir>/skills/` — `~/.vargos/workspace/skills/` (user-edited)
- `<cwd>/skills/` — project-local (when channel `cwd` is set)

Pi SDK de-dups by name + realpath. Order of precedence: workspace → agent → cwd → cwd/.pi.

**Bundled skills land under `agent/skills/`**, not `workspace/skills/` — `agent/` is the Pi-SDK-managed layer Vargos owns and ships defaults for; `workspace/` is reserved for user-editable additions.

## How agents use skills

Pi SDK injects an `<available_skills>` block into the system prompt with each skill's `name`, `description`, and `location` — but **not the body**. The agent reads the body via the `read` tool when it decides the skill is relevant. This is Anthropic's progressive-disclosure pattern.

The system prompt also instructs: *"Use the read tool to load a skill's file when the task matches its description."*

## Channel persona `allowedTools` filter

Channel personas can whitelist tools via glob (`memory.*`, `mcp.atlassian.*`). The whitelist filters **bus tools only** — skills (read via the file system) and Pi SDK built-ins (`read`/`bash`/`edit`/`write`/...) are always available.

## Creating a skill

The fastest path: ask the agent to use the bundled `skill-creator`. It guides you through concrete examples → reusable resources → init → editing → iteration.

Or just create `~/.vargos/agent/skills/<name>/SKILL.md` manually.

## See also

- [`.templates/vargos/agent/skills/skill-creator/SKILL.md`](../../.templates/vargos/agent/skills/skill-creator/SKILL.md) — bundled skill-creator
- [Runtime](../usage/runtime.md) — system prompt assembly
- [Personas](../usage/personas.md) — channel-scoped tool filtering
