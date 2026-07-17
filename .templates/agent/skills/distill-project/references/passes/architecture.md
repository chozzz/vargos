# Pass: architecture

**Output:** `<distilled_path>/ARCHITECTURE.md`

## Goal

Explain how the project works as a system: major components, data/control flow, boundaries, extension points, and architectural tradeoffs.

## Sources

Required:

- `CODEBASE.md` if present.
- Source files that define entrypoints, services, routing, domain models, storage, queues, jobs, RPC, events, or plugin systems.
- Architecture docs and ADRs when present.

Optional:

- Git history for major rewrites.
- GitHub PRs/issues that introduced or changed architecture.
- Confluence architecture pages.
- SonarQube architectural/code-quality issues.

## Procedure

1. Identify the runtime shape: process model, service boundaries, request/event/job flow, storage, external dependencies, and failure paths.
2. Separate stated design from inferred design. Label inferred design as such and cite code evidence.
3. Capture extension points, seams, contracts, and places where cross-module imports or coupling are intentionally constrained.
4. Record tradeoffs and known architectural debt only when supported by docs, code comments, tickets, PRs, or repeated patterns.
5. Include diagrams as Mermaid only when they clarify a real flow.

## Output Shape

- `# Architecture`
- `## System Overview`
- `## Runtime Model`
- `## Major Components`
- `## Data And Control Flow`
- `## Boundaries And Contracts`
- `## Extension Points`
- `## Tradeoffs And Constraints`
- `## Architecture Debt`
- `## Domain Handoff`
- `## Sources`

## Quality Bar

Make this dense enough that a model can answer design questions without hallucinating. Avoid marketing-style summaries.
