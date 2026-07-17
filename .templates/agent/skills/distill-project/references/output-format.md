# Output Format — Common MD Structure

Every distilled MD follows this shape. Consistency helps downstream CPT because the model sees the same patterns repeatedly and can attend to the structural markers.

## Top matter

```markdown
# <Project Name> — <Topic>

> Distilled <YYYY-MM-DD> via `distill-project` skill.
> Project root: `<repo path>`
> Sources: <n> code refs, <n> commits, <n> PRs, <n> tickets, <n> confluence pages, <n> sonar findings
```

For any category whose MCP is disabled or unavailable, substitute `N/A (disabled)` or `N/A (unavailable)` for the count. Always include the placeholder — a downstream reader should be able to tell at a glance which sources were mined.

## Body sections

- Use `##` for major sections, `###` for sub-sections.
- Prefer short paragraphs over walls of text — CPT chunker paragraph-packs.
- Use code fences (`` ``` ``) for exact interfaces, config, or code excerpts.
- Use bullet lists for enumerations.
- Never emit tables wider than 80 chars; the chunker doesn't reflow tables.

## Citation style

Inline citations are optional. Every non-obvious claim SHOULD end with `[src: <ref>]` or point at the Sources footer.

Preferred inline form:

```markdown
The frontend externalises its shared UI library so each app pins its own version [src: pkg-json].
```

Where `pkg-json` maps to an entry in the Sources footer.

## Sources footer

Every MD ends with:

```markdown
## Sources

- **code**:
  - `apps/web/package.json:12` — dependency pin
  - `packages/shared/src/config.ts:34-52` — config resolution rules
- **git**:
  - `a1b2c3d` — "Split shared package out of monolith" (2025-11-04)
- **pr**:
  - org/repo#1284 — "Extract shared components"
- **jira**:
  - PROJ-4521 — Cross-app version drift audit
- **confluence**:
  - https://example.atlassian.net/wiki/spaces/PROJ/pages/12345 — Frontend Architecture
- **sonar**:
  - `apps-web:src/lib/theme.ts:145` — cognitive complexity 22
```

Categories are `code`, `git`, `pr`, `jira`, `confluence`, `sonar`. Omit any category with zero entries. Do not invent citation targets — every one must be something the subagent actually opened and read.

When an MCP is disabled or unavailable, still emit the categories that came from fs+git (`code`, `git`) — those are always populated.

## No-evidence sections

When a section header applies but the subagent found no evidence:

```markdown
### Retry semantics

_(none found)_
```

Do not fabricate. The `_(none found)_` marker teaches the CPT model that some claims are absent, which is more useful than a plausible-sounding fabrication.

## Size targets

- Ideal MD size: 15–25 KB.
- Hard cap: 40 KB. If exceeded, split per `chunking.md`.
- Minimum: 2 KB. Below this, log as `failed` in the run journal — a healthy pass should never produce less.

## Header hierarchy

Only one `#` per file (the title). Never emit `####` — flatten to `###` with a bold lead-in instead:

```markdown
### Session flow

**Idle**  
The channel exists but no active turn.

**Awaiting-tool-result**  
Agent has emitted tool_calls and is waiting.
```
