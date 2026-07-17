# Pass: history

**Output:** `<distilled_path>/HISTORY.md`

## Goal

Recover the project story: why it exists, how it changed, important migrations, decisions, reversals, incidents, releases, and unresolved historical context.

## Sources

Required:

- Git log and notable commits within `config.hints.history_window_months` unless the config says otherwise.
- CHANGELOG, release notes, migration docs, ADRs, roadmap docs.

Optional:

- GitHub merged PRs and issues.
- Jira epics/stories/bugs.
- Confluence decision/history pages.

## Procedure

1. Build a timeline of meaningful changes, grouped by theme rather than listing every commit.
2. Extract decisions and their reasons where evidence exists.
3. Capture migrations, major dependency changes, infrastructure changes, deprecations, feature removals, and incident fixes.
4. Include abandoned approaches and reversals if visible.
5. Mark uncertain history explicitly.

## Output Shape

- `# History`
- `## Timeline`
- `## Major Decisions`
- `## Migrations And Rewrites`
- `## Releases And Milestones`
- `## Incidents And Regressions`
- `## Abandoned Or Reversed Approaches`
- `## Open Historical Questions`
- `## Domain Handoff`
- `## Sources`

## Quality Bar

History is CPT gold. Prefer concrete dates, commit IDs, PR numbers, ticket keys, and release versions over generic prose.
