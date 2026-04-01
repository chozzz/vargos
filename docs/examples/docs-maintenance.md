# Example: Automated Docs Maintenance

A weekly cron reads all documentation files, cross-references them against current code, and surfaces quick wins: stale sections, missing use cases, inconsistencies, and low-effort improvements.

## Cron Configuration

```jsonc
{
  "cron": {
    "tasks": [
      {
        "name": "Weekly Docs Review",
        "schedule": "0 10 * * 1",
        "task": "Review all Markdown files in docs/. For each file: check if content matches current code. Identify: (1) stale claims, (2) missing sections, (3) implemented features still marked as planned, (4) quick wins under 30 min. Write prioritized action items to HEARTBEAT.md.",
        "notify": ["whatsapp:61423222658"]
      }
    ]
  }
}
```

## What It Checks

| Check | Method |
|-------|--------|
| Stale plans | Cross-reference docs/plans/ against services/ code |
| Bug status | Check docs/bugs/ against code — mark fixed bugs resolved |
| Missing use cases | Scan FEATURES.md for features without example docs |
| Config drift | Verify config examples match current schema |
| Broken links | Find references to files that no longer exist |
| Orphaned docs | Find docs referencing removed features |

## Output

Agent writes findings to `HEARTBEAT.md` under `## Docs Quick Wins`. The next heartbeat poll picks up these tasks and can execute them autonomously.

## Benefits

- **Automated maintenance**: No manual doc audits required
- **Fresh documentation**: Stale sections identified weekly
- **Low friction**: Agent suggests, human approves (or lets agent execute)

See [workspace-files.md](../workspace-files.md) for HEARTBEAT.md structure and [configuration.md](../configuration.md) for cron setup.
