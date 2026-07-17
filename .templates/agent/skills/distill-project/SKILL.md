---
name: distill-project
description: >
  Distill a software project into a curated set of markdown documents suitable for continued pretraining (CPT), agent onboarding, or long-lived RAG corpus. Runs a full multi-pass sweep over the configured project root, dispatching a subagent per pass so each topic (architecture, history, conventions, integrations, operations, known issues, glossary, runbooks, business context, codebase map) gets its own focused context window and cannot cross-contaminate.
  Activate when the user asks to: distill a project, generate CPT docs, produce a knowledge dump, capture architecture/history/conventions/context for a repo, build a knowledge base per project, extract MDs from a codebase, prepare domain-fact training corpus, run a distillation pass, or write the CPT-ready markdowns for a domain.
  Also activate when the user mentions: `distilled/`, "CPT corpus", "domain knowledge dump", "capture the history/architecture of X", "onboarding docs for the model", "run a distillation on <project>", or references paths like `/mnt/shared/choz-vault/<Project>/distilled/`.
---

# Distill Project

Produce a curated set of markdown documents that capture the essence of a software project for downstream continued pretraining (CPT), long-lived agent context, or a knowledge-base seed. Runs a **10-pass** sweep, dispatching one subagent per pass. Each pass reads the pass-specific instructions from `references/passes/<name>.md`, mines whatever sources are available (filesystem + git are always usable; MCP tools like github, jira, confluence, sonarqube are consulted only when the config declares them and the platform provides them), and writes one focused MD file.

Exhaustive is the point. Prefer density over brevity — CPT rewards high-signal token count. Every claim must cite a source (code path, PR number, ticket key, confluence URL, sonar hotspot id, or git commit).

Use this skill for **one project or repo family at a time**. Reserve "domain" for a later aggregation layer that combines multiple project distillations, conversation distillations, and business context into a cross-project pack.

## Environment

Works in both **Claude Code** and **Vargos**. Both provide subagent dispatch (`Task` in Claude Code, `runSubagent` in Vargos). MCP availability varies — this skill assumes nothing about which MCPs are present. It reads `config.mcps.<name>.enabled` before attempting any MCP call.

If neither platform provides subagents, degrade to serial in-context passes (see `references/subagent-dispatch.md`), but expect worse quality — a full sweep in one context window exceeds token budget.

## Before Starting

1. **Resolve config.** Look for `distill-config.json` in this order: `$PWD/`, `$PWD/.distill/`, or the path the user names. If none exists, copy `config-example.json` to `$PWD/distill-config.json`, ask the user to fill it in, then re-invoke. Config declares distilled output path, which passes to run, and which MCPs are enabled with their identifiers. **All MCPs default to disabled** — only what the user explicitly enables will be used.
2. **Verify distilled path.** Create `<distilled_path>/` if missing. Warn if it contains existing MDs (rerun overwrites).
3. **Probe MCPs.** For each MCP where `config.mcps.<name>.enabled == true`, do a health check. Mark unreachable ones as unavailable. Skip probes for disabled MCPs entirely. See `references/mcp-fallbacks.md` for how each pass degrades when its preferred MCPs are missing.

## Workflow

Read `workflows/full-distillation.md` and execute every step. It orders passes so later ones can reference earlier outputs (architecture reads codebase-map; runbooks reads operations).

## Passes

Each pass = one subagent = one output MD. Pass details live in `references/passes/<slug>.md`.

| # | Slug             | Output MD           | Depends on          |
|---|------------------|---------------------|---------------------|
| 0 | codebase-map     | `CODEBASE.md`       | —                   |
| 1 | architecture     | `ARCHITECTURE.md`   | codebase-map        |
| 2 | history          | `HISTORY.md`        | —                   |
| 3 | conventions      | `CONVENTIONS.md`    | —                   |
| 4 | context          | `CONTEXT.md`        | —                   |
| 5 | integrations     | `INTEGRATIONS.md`   | codebase-map        |
| 6 | operations       | `OPERATIONS.md`     | integrations        |
| 7 | known-issues     | `ISSUES.md`         | history             |
| 8 | glossary         | `GLOSSARY.md`       | context, conventions |
| 9 | runbooks         | `RUNBOOKS.md`       | operations, context  |

Order is deliberate but not strict — dependencies are for cross-referencing, not blocking. If a subagent finds no prior file, it proceeds without one and notes the gap.

## Global Rules

- **Cite every non-obvious claim.** `references/output-format.md` defines the Sources footer format.
- **Never invent.** If evidence is missing for a section, write `_(none found)_`. Do not fill from imagination — this poisons CPT.
- **Chunk smartly.** Target ~15–25 KB per MD; hard cap 40 KB. If a topic overflows, split (`ARCHITECTURE_backend.md`, `ARCHITECTURE_frontend.md`, etc.) per `references/chunking.md`.
- **One subagent, one output.** Fresh context per pass prevents topic bleed. See `references/subagent-dispatch.md` for how to prompt a subagent.
- **Exhaustive discovery, deterministic output.** Explore MCPs aggressively but write the MD to the exact template shape.
- **Preserve domain handoff.** When a finding belongs above this project (customer vocabulary, organization preference, shared platform constraint), include it under `## Domain Handoff` so a future domain-pack skill can collect it.

## Reference Files

Load on demand:

- `workflows/full-distillation.md` — 10-step orchestration.
- `references/output-format.md` — canonical MD structure, Sources footer, header conventions.
- `references/mcp-fallbacks.md` — MCP availability rules; what to do when confluence/jira/sonar are missing.
- `references/subagent-dispatch.md` — prompt template for spawning a per-pass subagent (works in Claude Code and Vargos).
- `references/chunking.md` — size targets, split rules for oversized topics.
- `references/passes/<slug>.md` — one file per pass; the subagent reads its own file.

## When to Stop

The skill run completes when every configured pass has an output file and the user has been shown a summary (file paths + sizes + citation counts). Do not judge quality — leave that for human review.
