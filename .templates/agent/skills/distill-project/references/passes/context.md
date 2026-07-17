# Pass: context

**Output:** `<distilled_path>/CONTEXT.md`

## Goal

Capture the product, business, user, organization, and domain context around the project without drifting into unsupported speculation.

## Sources

Required:

- README, docs, product copy, route names, domain models, sample data, fixtures, config defaults.

Optional:

- Confluence product/strategy pages.
- Jira epics and user stories.
- GitHub issue discussions.

## Procedure

1. Identify what the project does and who it is for.
2. Extract domain vocabulary, user roles, workflows, business rules, constraints, and non-goals.
3. Note which context is embedded in code versus external docs.
4. Capture sensitive or proprietary context only at a level appropriate for the intended training corpus.
5. Mark unknowns and areas requiring human confirmation.

## Output Shape

- `# Context`
- `## Purpose`
- `## Users And Roles`
- `## Domain Vocabulary`
- `## Core Workflows`
- `## Business Rules`
- `## Constraints And Non-Goals`
- `## Sensitive Areas`
- `## Domain Handoff`
- `## Sources`

## Quality Bar

Keep this grounded. Domain prose without citations is training poison.
