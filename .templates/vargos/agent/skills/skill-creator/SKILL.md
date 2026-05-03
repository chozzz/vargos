---
name: skill-creator
description: Use when the user wants to create a new skill or update an existing one — extending the agent with specialized knowledge, workflows, or tool integrations packaged as a SKILL.md plus optional bundled resources.
---

# Skill Creator

Skills are modular, self-contained packages that extend the agent with procedural knowledge for specific domains. They live as directories under one of:

- `~/.vargos/agent/skills/<name>/` — auto-loaded by Pi SDK (workspace-wide)
- `~/.vargos/workspace/skills/<name>/` — Vargos workspace skills
- `<cwd>/skills/<name>/` — project-local (auto-loaded for sessions whose `cwd` matches)
- `<cwd>/.pi/skills/<name>/` — Pi SDK convention for project skills

Each location is auto-discovered. Pi SDK injects `<name>` + `<description>` of every skill into the system prompt; the body is read on demand via the `read` tool.

## Core principles

### Concise is the rule

Context is shared with the system prompt, every other skill's metadata, conversation history, and the user's request. Default assumption: the agent is already smart. Add only context the agent doesn't already have. Prefer concise examples over verbose explanations. Challenge each paragraph: "Does this justify its token cost?"

### Set appropriate degrees of freedom

Match specificity to the task's fragility:

- **High freedom** (text instructions): multiple approaches valid, decisions depend on context.
- **Medium freedom** (pseudocode, parameterised scripts): a preferred pattern exists, some variation OK.
- **Low freedom** (specific scripts, few parameters): operations are fragile, consistency critical, exact sequence required.

### Progressive disclosure

Three loading levels:

1. **Metadata** (`name` + `description`) — always in context (~100 words across all skills).
2. **SKILL.md body** — only when the skill triggers (target <500 lines).
3. **Bundled resources** — loaded by the agent only when needed.

When SKILL.md grows past ~500 lines, split content into `references/<topic>.md` and link from SKILL.md.

## Anatomy

```
<skill-name>/
├── SKILL.md                  required — frontmatter + body
├── scripts/                  optional — executable code (.sh / .py / .js)
├── references/               optional — docs the agent loads on demand
└── assets/                   optional — files used in output (templates, images, etc.)
```

### `SKILL.md`

**Frontmatter** must contain only `name` and `description`. The description is the trigger — it must say what the skill does AND when to use it. Example:

```yaml
---
name: pdf-editor
description: Edit, rotate, merge, and split PDF files. Use when the user asks to modify PDF content, rearrange pages, extract pages, or convert PDFs.
---
```

**Body**: imperative-form instructions. No "When to use this skill" section — that belongs in the description (the body only loads after triggering). Keep it lean: workflow, key decisions, references.

### `scripts/`

Executable code for tasks needing determinism, repetition, or token-efficiency.

- Shebang on first line (`#!/usr/bin/env bash`, `#!/usr/bin/env python3`, etc.)
- `set -euo pipefail` for bash
- Header comment: purpose, inputs, outputs, last-used date
- Idempotent where possible
- Keep <80 lines

The agent runs them via the `bash` tool. They don't consume context window unless the agent reads them for patching.

### `references/`

Reference material loaded on demand: schemas, API docs, domain knowledge, long workflows. Link to them from SKILL.md so the agent knows when to read each. Avoid duplicating content between SKILL.md and references.

For files >100 lines, put a table of contents at the top so the agent can scan scope before fully loading.

### `assets/`

Files used in the agent's output (templates, boilerplate, fonts, sample documents). Not loaded into context — copied/modified as part of producing output.

## What NOT to include

Skip auxiliary documentation: `README.md`, `INSTALLATION.md`, `CHANGELOG.md`, etc. Skills are agent-facing, not human-facing. Extra files just add clutter.

## Skill creation workflow

1. **Concrete examples** — get 3–5 concrete user requests this skill should handle. Ask the user if you don't have them.
2. **Plan reusable contents** — for each example, identify what scripts / references / assets would help across requests.
3. **Create the directory** — `mkdir -p <root>/skills/<name>/{scripts,references,assets}` (drop subdirs you won't use).
4. **Write SKILL.md** — frontmatter (`name`, `description`), then imperative-form body. Reference any bundled resources by relative path.
5. **Add bundled resources** — start small. Test scripts by actually running them.
6. **Iterate** — use the skill on real tasks, notice friction, refine SKILL.md or resources.

## Naming

- Lowercase, kebab-case (`code-review`, `pdf-editor`).
- Singular noun describing the domain or verb describing the action.
- Match the directory name to the `name` field exactly.

## Example minimal skill

```
~/.vargos/workspace/skills/git-tidy/
├── SKILL.md
└── scripts/
    └── prune-merged.sh
```

`SKILL.md`:

```markdown
---
name: git-tidy
description: Clean up local git branches that have been merged. Use when the user asks to delete merged branches, prune stale branches, or clean up after PRs.
---

# git-tidy

Run `scripts/prune-merged.sh` from the repo root. It deletes local branches whose tip commit is reachable from `main` (or `master`).

For more aggressive cleanup (branches with squashed/rebased PRs), prompt the user before running with `--squashed`.
```

`scripts/prune-merged.sh`:

```bash
#!/usr/bin/env bash
# purpose: delete local branches already merged to main/master
# inputs:  optional --squashed flag
# outputs: list of deleted branches to stdout
# last-used: 2026-05-03
set -euo pipefail

base="$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null | sed 's|origin/||' || echo main)"
git branch --merged "$base" | grep -v "^\* " | grep -v "$base$" | xargs -r git branch -d
```

That's a complete, minimal, useful skill — 2 files, every line earns its place.
