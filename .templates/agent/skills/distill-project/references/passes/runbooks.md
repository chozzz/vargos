# Pass: runbooks

**Output:** `<distilled_path>/RUNBOOKS.md`

## Goal

Turn operational and developer workflows into concrete runbooks: setup, build, test, deploy, troubleshoot, migrate, recover, regenerate data, and perform recurring maintenance.

## Sources

Required:

- README, scripts, package commands, CI workflows, ops docs, deployment files, migration scripts, local env examples.

Optional:

- Confluence runbooks.
- Jira incident/resolution notes.
- GitHub PRs for recurring fixes.

## Procedure

1. Identify workflows a human or agent will repeat.
2. Write each runbook as prerequisites, commands, expected output, verification, rollback, and common failure modes.
3. Use exact commands from source. Do not invent commands.
4. Include environment assumptions and paths.
5. Note missing verification steps as gaps.

## Output Shape

- `# Runbooks`
- `## Local Setup`
- `## Development Loop`
- `## Testing And Validation`
- `## Build And Release`
- `## Deployment And Rollback`
- `## Data And Migration Tasks`
- `## Troubleshooting`
- `## Domain Handoff`
- `## Sources`

## Quality Bar

Every runbook should be executable by a careful engineer after filling only project-specific secrets or environment values.
