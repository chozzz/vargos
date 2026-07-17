# Pass: conventions

**Output:** `<distilled_path>/CONVENTIONS.md`

## Goal

Capture how work is expected to be done in this project: coding style, tests, logging, errors, structure, naming, documentation, commits, release workflow, and local norms.

## Sources

Required:

- Contribution docs, AGENTS files, README sections, lint/test config, formatting config, package scripts.
- Representative implementation and tests.

Optional:

- GitHub PR review comments when available.
- Jira/Confluence engineering standards.

## Procedure

1. Extract explicit rules first.
2. Infer recurring conventions from repeated code only when examples are numerous and consistent.
3. Separate hard rules from common tendencies.
4. Include commands and workflows exactly as written.
5. Note anti-patterns the project avoids.

## Output Shape

- `# Conventions`
- `## Hard Rules`
- `## Project Structure`
- `## Coding Style`
- `## Testing Style`
- `## Logging And Errors`
- `## Documentation Style`
- `## Workflow And Releases`
- `## Anti-Patterns`
- `## Domain Handoff`
- `## Sources`

## Quality Bar

This file should help an agent make edits that look native to the project.
