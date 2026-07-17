# Pass: glossary

**Output:** `<distilled_path>/GLOSSARY.md`

## Goal

Define project-specific terms, acronyms, names, commands, files, concepts, user roles, services, and domain vocabulary.

## Sources

Required:

- Code symbols, docs, config names, README, tests, fixtures, routes, schemas, CLI help, user-facing copy.

Optional:

- Confluence glossaries.
- Jira labels/components/epics.
- GitHub issue/PR terminology.

## Procedure

1. Extract terms that are specific to this project or domain.
2. Define each term in one or two grounded sentences.
3. Include aliases, casing variants, deprecated names, and related files where helpful.
4. Avoid generic programming terms unless the project uses them in a special way.
5. Include tokenization-sensitive names and proper nouns that should be learned consistently.

## Output Shape

- `# Glossary`
- `## Product And Domain Terms`
- `## Code And Architecture Terms`
- `## Commands And Tools`
- `## Services And Integrations`
- `## Acronyms`
- `## Deprecated Or Alias Terms`
- `## Domain Handoff`
- `## Sources`

## Quality Bar

This is both onboarding material and CPT vocabulary reinforcement. Keep definitions short, source-backed, and consistent.
