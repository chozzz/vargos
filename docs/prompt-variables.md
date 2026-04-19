# Prompt Variable Interpolation

Cron task prompts and other agent instructions support variable interpolation. This allows prompts to reference dynamic paths without hardcoding them.

## Supported Variables

| Variable | Value | Example |
|----------|-------|---------|
| `${WORKSPACE_DIR}` | User's workspace directory | `~/.vargos/workspace` |
| `${DATA_DIR}` | User's data directory (respects `$VARGOS_DATA_DIR`) | `~/.vargos` |
| `${SESSIONS_DIR}` | Session storage directory | `~/.vargos/sessions` |
| `${CACHE_DIR}` | Cache directory | `~/.cache/vargos` |
| `${LOGS_DIR}` | Logs directory | `~/.vargos/logs` |
| `${CHANNELS_DIR}` | Channels storage directory | `~/.vargos/channels` |
| `${HOME}` | User's home directory | `/home/username` |
| `${PWD}` | Current working directory | `/path/to/cwd` |

## Usage in Cron Tasks

Define variables in your cron task markdown files (stored in `~/.vargos/cron/*.md`):

```yaml
---
id: daily-review
name: Daily Review
schedule: "0 9 * * *"
enabled: true
---

Review the checklist at ${WORKSPACE_DIR}/CHECKLIST.md and report findings.
```

When the cron task executes, `${WORKSPACE_DIR}` is replaced with the actual path:
```
Review the checklist at /home/user/.vargos/workspace/CHECKLIST.md and report findings.
```

## Built-in Example: Heartbeat

The heartbeat task is an ephemeral cron task. A template is provided at `.templates/vargos/cron/heartbeat.md` in the repo. It uses interpolation to reference workspace files:

```yaml
---
id: heartbeat
name: Heartbeat
schedule: "*/30 * * * *"
enabled: true
activeHours: [8, 22]
activeHoursTimezone: "Australia/Sydney"
---

Heartbeat poll. Read ${WORKSPACE_DIR}/HEARTBEAT.md for your checklist.
Follow it strictly — do not infer tasks from previous sessions.
If nothing needs attention, reply with exactly: HEARTBEAT_OK
```

This ensures the heartbeat task can always find the workspace file regardless of the agent's current working directory.

## Best Practices

1. **Use workspace for user-editable files**: Place task checklists and configuration at `${WORKSPACE_DIR}` so users can easily find and edit them.

2. **Use data dir for system files**: Reference system data at `${DATA_DIR}` for locations managed by Vargos.

3. **Avoid hardcoding paths**: Don't use `/home/username/...` paths directly. Use variables for portability across machines and users.

4. **Document path assumptions**: In task descriptions, note which files the agent will read.

## Example: Multi-File Review Task

Create `~/.vargos/cron/weekly-docs-check.md`:

```yaml
---
id: weekly-docs-check
name: Weekly Docs Check
schedule: "0 9 * * 0"
enabled: true
---

Review all .md files in ${WORKSPACE_DIR}/docs/. Check each for:
1. Stale information
2. Broken references
3. Missing context

For each issue, write a note to ${WORKSPACE_DIR}/HEARTBEAT.md under '## Docs Review'.
```
