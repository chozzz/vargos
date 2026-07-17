# Pass: known-issues

**Output:** `<distilled_path>/ISSUES.md`

## Goal

Capture known bugs, technical debt, fragility, risks, TODOs, failing areas, incomplete migrations, security concerns, and recurring support problems.

## Sources

Required:

- TODO/FIXME comments, issue docs, failing/skipped tests, deprecation notes, local warnings, code comments, CHANGELOG known issues.

Optional:

- GitHub open issues and PR discussions.
- Jira bugs/incidents.
- SonarQube issues/hotspots/duplication.
- Confluence risk registers.

## Procedure

1. Inventory issues by severity and area.
2. Distinguish confirmed defects from suspected risks.
3. Link issues to code paths, tests, tickets, PRs, or docs.
4. Include remediation hints only when the source suggests them or they follow directly from code evidence.
5. Avoid expanding scope into a refactor plan.

## Output Shape

- `# Known Issues`
- `## Critical Or User-Facing Issues`
- `## Technical Debt`
- `## Reliability Risks`
- `## Security And Compliance Concerns`
- `## Test Gaps`
- `## Deprecated Or Incomplete Work`
- `## Remediation Notes`
- `## Domain Handoff`
- `## Sources`

## Quality Bar

This file should help future training avoid presenting known weak spots as intentional design.
