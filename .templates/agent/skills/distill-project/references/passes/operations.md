# Pass: operations

**Output:** `<distilled_path>/OPERATIONS.md`

## Goal

Capture how the project runs outside the editor: deployment, runtime config, processes, scheduled jobs, migrations, monitoring, backups, incident handling, performance constraints, and maintenance tasks.

## Sources

Required:

- Deployment configs, Dockerfiles, CI/CD workflows, scripts, cron files, service definitions, ops docs, env examples.

Optional:

- Confluence runbooks.
- Jira incident tickets.
- GitHub release/deployment PRs.
- SonarQube reliability/security findings.

## Procedure

1. Identify runtime environments and deployment paths.
2. Extract operational commands, env vars, data migrations, backups, rollback paths, and health checks.
3. Capture scheduled/background work and process supervision.
4. Note observability signals and alerting when present.
5. Mark missing operational docs as gaps.

## Output Shape

- `# Operations`
- `## Runtime Environments`
- `## Deployment`
- `## Configuration`
- `## Background Work`
- `## Data Maintenance`
- `## Observability`
- `## Backups And Rollback`
- `## Operational Gaps`
- `## Domain Handoff`
- `## Sources`

## Quality Bar

Prefer exact commands and config paths. Never include secret values.
