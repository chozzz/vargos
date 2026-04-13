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

Define variables in your `config.json` cron task prompts:

```json
{
  "cron": {
    "tasks": [
      {
        "id": "daily-review",
        "name": "Daily Review",
        "schedule": "0 9 * * *",
        "task": "Review the checklist at ${WORKSPACE_DIR}/CHECKLIST.md and report findings.",
        "enabled": true
      }
    ]
  }
}
```

When the cron task executes, `${WORKSPACE_DIR}` is replaced with the actual path:
```
Review the checklist at /home/user/.vargos/workspace/CHECKLIST.md and report findings.
```

## Built-in Example: Heartbeat

The heartbeat prompt uses interpolation to find `HEARTBEAT.md`:

```typescript
const DEFAULT_HEARTBEAT_PROMPT = [
  'Heartbeat poll. Read ${WORKSPACE_DIR}/HEARTBEAT.md for your checklist.',
  'Follow it strictly — do not infer tasks from previous sessions.',
  'If nothing needs attention, reply with exactly: HEARTBEAT_OK',
].join(' ');
```

This ensures the heartbeat task can always find the file regardless of the agent's current working directory.

## Best Practices

1. **Use workspace for user-editable files**: Place task checklists and configuration at `${WORKSPACE_DIR}` so users can easily find and edit them.

2. **Use data dir for system files**: Reference system data at `${DATA_DIR}` for locations managed by Vargos.

3. **Avoid hardcoding paths**: Don't use `/home/username/...` paths directly. Use variables for portability across machines and users.

4. **Document path assumptions**: In task descriptions, note which files the agent will read.

## Example: Multi-File Review Task

```json
{
  "id": "weekly-docs-check",
  "task": "Review all .md files in ${WORKSPACE_DIR}/docs/. Check each for:\n1. Stale information\n2. Broken references\n3. Missing context\n\nFor each issue, write a note to ${WORKSPACE_DIR}/HEARTBEAT.md under '## Docs Review'."
}
```
