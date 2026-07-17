# Pass: integrations

**Output:** `<distilled_path>/INTEGRATIONS.md`

## Goal

Document every meaningful boundary with external systems: APIs, databases, queues, auth providers, SaaS tools, CLIs, MCPs, storage, analytics, observability, build/deploy providers, and internal services.

## Sources

Required:

- Config files, env examples, client modules, SDK imports, API routes, adapters, deployment files, documentation.

Optional:

- Confluence integration specs.
- Jira integration tickets.
- GitHub PRs that added or changed integrations.
- SonarQube findings involving secrets, auth, network calls, or dependency risks.

## Procedure

1. Inventory integrations and classify by type.
2. For each integration, capture owner module, auth/config inputs, request/response shapes where visible, failure handling, local dev behavior, and test coverage.
3. Call out mocked, stubbed, or partially implemented integrations.
4. Include env vars by name, never secret values.
5. Record operational dependencies and rate limits only if sourced.

## Output Shape

- `# Integrations`
- `## Inventory`
- `## Configuration And Secrets`
- `## API And Service Boundaries`
- `## Data Stores And Queues`
- `## Auth And Identity`
- `## Observability And Analytics`
- `## Local Development`
- `## Risks And Gaps`
- `## Domain Handoff`
- `## Sources`

## Quality Bar

A future agent should be able to change an integration without guessing where credentials, clients, errors, and tests live.
