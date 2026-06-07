---
name: vargos-skill-creator
description: Use when the user wants to create or update a skill — a SKILL.md plus optional scripts/references/assets that extends the agent with procedural knowledge for a specific domain.
---

# VARGOS Skill Creator

Skills give the agent procedural knowledge keyed to conversational triggers — so repeated tasks finish faster with less back-and-forth. A skill can be a lone SKILL.md prompt, a single script, a wrapped open-source repo, or the full tree below; pick the smallest form that does the job.

They live in `~/.vargos/agent/skills/<name>/` and auto-load into VARGOS; other orchestrators can discover the same directory.

## Rules

- **Concise.** The agent is already smart. Add only what it doesn't know. Every line must earn its tokens.
- **Progressive disclosure.** Frontmatter (`name` + `description`) is always loaded; body loads on trigger; bundled files load on demand.
- **Imperative body.** No "When to use" section — that's the description's job.
- **Match freedom to fragility.** Prose for open-ended work, parameterised scripts for repeatable patterns, exact scripts for fragile sequences.

## Layout

Maximal form — drop anything you don't need:

```
<skill-name>/
├── SKILL.md       required
├── scripts/       optional — executable, deterministic
├── references/    optional — loaded on demand (TOC if >100 lines)
└── assets/        optional — copied into output (templates, boilerplate)
```

Skip `README.md`, `CHANGELOG.md`, etc. Skills are agent-facing.

## Frontmatter

Only `name` and `description`. The description is the trigger — state what + when.

```yaml
---
name: pdf-editor
description: Edit, rotate, merge, split PDFs. Use when the user asks to modify PDF content or rearrange pages.
---
```

## Scripts

Shebang, `set -euo pipefail` (bash), header with purpose/inputs/outputs, idempotent, <80 lines.

## Workflow

1. Get 3–5 concrete user requests the skill must handle.
2. Identify shared scripts/references/assets across them.
3. `mkdir -p <root>/skills/<name>` plus only the subdirs you'll use.
4. Write SKILL.md — frontmatter, then imperative body, reference bundled files by relative path.
5. Test scripts by running them. Iterate from real use.

## Naming

Lowercase kebab-case. Directory name == `name` field. Singular noun (domain) or verb (action).

## Minimal example

```
git-tidy/
├── SKILL.md
└── scripts/prune-merged.sh
```

```markdown
---
name: git-tidy
description: Clean up merged local git branches. Use when the user asks to prune stale branches.
---

# git-tidy

Run `scripts/prune-merged.sh` from the repo root. Pass `--squashed` (with user confirmation) for branches whose PRs were squash-merged.
```
