# Pass: codebase-map

**Output:** `<distilled_path>/CODEBASE.md`

## Goal

Map the project as it exists on disk. Make the output useful to an engineer or model that needs to know where things live before reading detailed architecture notes.

## Sources

Required:

- Filesystem tree from `config.project.root`.
- Key project manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, lockfiles, workspace files, build configs).
- README and contribution docs when present.

Optional:

- GitHub repo metadata, if enabled and available.
- Confluence onboarding pages, if enabled and available.

## Procedure

1. Identify project roots, packages, apps, services, libraries, scripts, docs, config, generated outputs, and ignored or vendored directories.
2. Summarize each meaningful top-level directory and major nested module.
3. Extract build/test/dev commands from manifests and docs.
4. Note ownership boundaries, entrypoints, public APIs, data stores, background workers, CLIs, and deployment surfaces.
5. Include explicit gaps when a module is present but unclear.

## Output Shape

Use `references/output-format.md`, with these sections:

- `# Codebase Map`
- `## Project Identity`
- `## Repository Layout`
- `## Entrypoints`
- `## Packages And Modules`
- `## Build, Test, And Dev Commands`
- `## Generated Or External Content`
- `## Gaps And Unknowns`
- `## Domain Handoff`
- `## Sources`

## Quality Bar

Prefer exhaustive inventory over interpretation. Do not describe architectural intent here unless the source states it directly; save inference for the architecture pass.
