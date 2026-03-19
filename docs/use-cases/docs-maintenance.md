# Use Case: Docs Maintenance Cron

## Summary

A weekly cron reads all `docs/` Markdown files, cross-references them against current code and plans, and surfaces quick wins: stale sections, missing use cases, inconsistencies, and low-effort improvements.

## Suggested Cron Config

```json
{
  "id": "docs-review-weekly",
  "name": "Weekly Docs Review",
  "schedule": "0 10 * * 1",
  "task": "Review all Markdown files in /home/choz/apps/vargos/docs/. For each file: check if content matches current code (read relevant src/ files to verify). Identify: (1) stale or incorrect claims, (2) missing sections obvious from the code, (3) bugs/plans that are already implemented and can be closed, (4) quick wins — small doc improvements that take < 30 min. Write a prioritized list of action items to HEARTBEAT.md under '## Docs Quick Wins'. Do not rewrite docs — just identify what needs doing.",
  "notify": ["whatsapp:61423222658"]
}
```

## What It Checks

| Check | How |
|-------|-----|
| Stale plans | Cross-reference `docs/plans/` checklists against `src/` — mark done items |
| Bug status | Check `docs/bugs/` against code — mark fixed bugs as resolved |
| Missing use cases | Scan for features in CLAUDE.md/FEATURES.md with no use-case doc |
| Config drift | Verify config examples in docs match current `src/config/pi-config.ts` schema |
| Broken links | Find `docs/X.md` references to files that no longer exist |
| Orphaned docs | Find docs that reference removed features |

## Notes

- Runs Monday 10am so findings are ready at the start of the week
- Outputs to HEARTBEAT.md — picked up by next heartbeat agent run
- Agent reads code to verify claims — uses `fs_read` and `glob` tools, not guesses
- Quick wins only — not a full rewrite trigger
