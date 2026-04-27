# Self-Tools Curation Strategy

## The Problem

Vargos agents can already read, write, and execute code. Left unbounded, agents could modify their own runtime source (`src/`), overwrite config files, or create tools that circumvent safety boundaries. We need a clear mental model of what agents _should_ touch and what they shouldn't.

---

## Two Distinct Directories

| Directory | Owner | Agent Access | Purpose |
|-----------|-------|--------------|---------|
| `~/.vargos/workspace/` | User / Agent | Full read+write | Skills, agents, memory, HEARTBEAT.md, persona |
| `src/` (project source) | Developer | Read-only in prod | Runtime code — requires a human to change |

**The rule:** Agents live in the workspace. They do not touch `src/`.

---

## Workspace Layout (Agent-Facing)

```
~/.vargos/workspace/
├── SOUL.md              # Identity and persona
├── AGENTS.md            # Procedure library (how to do things)
├── TOOLS.md             # Tool catalog for the agent
├── HEARTBEAT.md         # Current task queue (what to do)
├── MEMORY.md            # Long-term facts the agent has written
├── skills/
│   └── <name>/
│       └── SKILL.md     # Reusable prompt recipes
└── agents/
    └── <name>.md        # Sub-agent role definitions
```

Agents create and modify files here freely. This is the intended extension surface.

---

## Self-Tools: What Agents Can Build

Agents can author new skills (`~/.vargos/workspace/skills/<name>/SKILL.md`) and new agent definitions. These appear automatically on the next run via the Pi SDK's `DefaultResourceLoader` resource loading mechanism.

**Skills are the correct tool-curation mechanism.** An agent that learns a new procedure writes it as a SKILL.md. It does not modify `src/tools/`.

---

## What Agents Should Not Do

- Modify `src/` — runtime source requires a developer decision + test + deploy cycle.
- Modify `~/.vargos/config.json` directly — changes should go through the `cron.add`/`cron.update` RPC tools, not raw file writes, so validation and reload are triggered correctly.
- Write to `~/.vargos/sessions/` — sessions are managed by `FileSessionService`; direct writes bypass message ordering and metadata.

---

## Enforcement Approach (Current)

No hard enforcement today — the `exec` tool can technically run anything. The boundary is:

1. **Prompt-level**: `TOOLS.md` and the system prompt describe the intended scope. Agents are told to create skills, not modify source.
2. **SOUL.md framing**: agents understand they are in a workspace sandbox.
3. **Skill scanner**: if an agent writes a valid SKILL.md, it gets picked up — no runtime reload of `src/` is needed.

---

## Future Hardening (Phase B)

When the web UI / observability service lands, we can tighten this:

- **Filesystem boundary tool**: `write` and `edit` tools accept an optional `allowedRoots` config. Default: `~/.vargos/workspace/` only. `src/` and `~/.vargos/config.json` require explicit `unsafe: true` override.
- **Config mutations via RPC only**: deprecate direct config file writes from agent tools; route through a `config.update` gateway method that validates + reloads.
- **Audit log**: `~/.vargos/errors.jsonl` already captures tool errors. Add an `audit.jsonl` for successful writes to non-workspace paths.

---

## Self-Improvement Loop

The intended flow for an agent that wants to add a new capability:

```
1. Agent identifies a repeated pattern worth encoding
2. Agent writes ~/.vargos/workspace/skills/<name>/SKILL.md
   (using the write tool — within workspace boundary)
3. Next run: scanner picks it up, skill appears in system prompt
4. Agent can now activate it with skill_load
5. If the skill needs a new external tool (API, CLI): agent files a
   note in HEARTBEAT.md for the human to implement and expose
```

This keeps the feedback loop tight (agent can extend its own prompting surface immediately) while keeping the runtime boundary clear (new tools require a human to write and register them in `src/tools/`).
