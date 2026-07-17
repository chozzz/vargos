---
name: distill-jsonl-conversation
description: >
  Distill JSONL conversation/session logs into CPT-ready markdown, durable user/project preferences, lessons learned, workflow patterns, and optionally clean SFT examples. Activate when the user asks to mine chat logs, summarize agent sessions, extract preferences from JSONL, distill Copilot/Claude/Vargos transcripts, build conversation-derived training corpus, recover project history from conversations, or turn session logs into markdown knowledge.
---

# Distill JSONL Conversation

Mine JSONL conversations without pretending they are clean documentation. Conversations contain useful facts, but also false starts, stale assumptions, private details, tool noise, and model mistakes. This skill extracts durable knowledge only when the conversation itself provides enough evidence.

Primary output is **CPT-ready Markdown**. Optional secondary outputs are preference notes, strategy notes, issue timelines, and SFT JSONL candidates when the source conversation contains a clean request/response arc.

## Environment

Works in Claude Code and Vargos. Filesystem access is required. Subagents are preferred for large logs: one subagent per extraction lane. MCPs are optional and are used only when configured; most runs need no MCPs.

## Before Starting

1. **Resolve config.** Look for `distill-jsonl-config.json` in `$PWD/`, `$PWD/.distill/`, or a user-named path. If missing, copy `config-example.json`, ask the user to fill in `inputs` and `output_root`, then re-invoke.
2. **Inventory inputs.** Expand JSONL files and directories. Count files, bytes, approximate records, and date range when timestamps exist.
3. **Detect schemas.** Read `references/schema-detection.md`. Do not assume one vendor format.
4. **Apply privacy rules.** Read `references/privacy-redaction.md` before writing any output.
5. **Route outputs.** Read `references/cpt-vs-sft-routing.md` to decide which content becomes Markdown, preference notes, or SFT candidates.

## Extraction Lanes

Run each enabled lane as a separate subagent when possible.

| # | Lane | Output | Purpose |
|---|------|--------|---------|
| 0 | schema-map | `SCHEMA_MAP.md` | Explain source formats, fields, roles, tool traces, and confidence. |
| 1 | project-knowledge | `PROJECT_KNOWLEDGE.md` | Extract durable project facts, architecture notes, histories, decisions, and constraints. |
| 2 | user-preferences | `USER_PREFERENCES.md` | Extract stable user preferences for coding, communication, workflows, tools, and training strategy. |
| 3 | distillation-strategy | `DISTILLATION_STRATEGY.md` | Capture what worked, what failed, data quality lessons, and future corpus strategy. |
| 4 | workflows-runbooks | `WORKFLOWS.md` | Extract repeatable commands, notebooks, services, validation steps, and operational procedures. |
| 5 | issues-lessons | `LESSONS_AND_ISSUES.md` | Extract bugs encountered, fixes, unresolved risks, and anti-patterns. |
| 6 | sft-candidates | `sft-candidates.jsonl` | Optional: emit clean instruction/response examples only when safe and coherent. |
| 7 | index | `INDEX.md` | Summarize outputs, source coverage, redactions, and confidence. |

## Global Rules

- **Prefer durable facts.** Do not preserve every utterance. Extract facts, decisions, preferences, constraints, and workflows that remain useful after the session.
- **Separate speaker truth from model output.** User statements and verified tool outputs carry more weight than assistant assertions.
- **Track confidence.** Mark each item as `high`, `medium`, or `low` confidence with a source pointer.
- **Do not train on mistakes as facts.** False starts are useful only as lessons or anti-patterns.
- **Redact aggressively.** Secrets, tokens, credentials, personal data, internal URLs, and sensitive customer data must be removed or summarized.
- **Keep raw quotes short.** Prefer paraphrased, cited knowledge over long transcript excerpts.
- **Use Markdown for knowledge.** Use SFT JSONL only for clean, generalizable assistant behavior examples.

## Output Layout

Write to `<output_root>/<run_slug>/` unless config names an exact directory:

```text
<run_slug>/
├── INDEX.md
├── SCHEMA_MAP.md
├── PROJECT_KNOWLEDGE.md
├── USER_PREFERENCES.md
├── DISTILLATION_STRATEGY.md
├── WORKFLOWS.md
├── LESSONS_AND_ISSUES.md
├── sft-candidates.jsonl        # optional
└── redaction-report.md
```

## Reference Files

Load on demand:

- `workflows/inspect-and-distill.md` — full orchestration.
- `references/schema-detection.md` — common JSONL transcript shapes.
- `references/privacy-redaction.md` — redaction and sensitivity rules.
- `references/extraction-taxonomy.md` — what to extract and where it belongs.
- `references/preference-extraction.md` — durable user preference rules.
- `references/cpt-vs-sft-routing.md` — Markdown vs SFT routing.
- `references/output-format.md` — canonical output shape.
- `references/chunking.md` — chunking and batching rules.

## When to Stop

Stop when every enabled lane has an output, `INDEX.md` lists source coverage and confidence, and `redaction-report.md` records what was removed or withheld. Show the user output paths, file sizes, and any low-confidence areas that need human review.
