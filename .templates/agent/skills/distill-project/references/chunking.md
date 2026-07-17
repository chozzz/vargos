# Chunking — When and How to Split an MD

Rules for keeping distilled files inside the size envelope that downstream CPT prep expects. The chunker in `prepare-cpt-raw.ipynb` targets ~6000-char paragraph-packed chunks; keeping our source MDs modestly sized avoids weird mid-paragraph splits.

## Size envelope

| Range      | Action                                                    |
|------------|-----------------------------------------------------------|
| < 2 KB     | Failure — log to `.distill-run.json` as `failed: too-small` |
| 2–15 KB    | OK, but note: probably means the topic is thin. Fine.     |
| 15–25 KB   | Ideal.                                                    |
| 25–40 KB   | OK, but split if there are natural section boundaries.    |
| > 40 KB    | Must split. See rules below.                              |

## When to split

Split *by natural section boundary*, never mid-flow. Common splits:

- **ARCHITECTURE.md → ARCHITECTURE_backend.md + ARCHITECTURE_frontend.md** when the system has a clear backend/frontend boundary.
- **HISTORY.md → HISTORY_2024.md + HISTORY_2025.md + HISTORY_2026.md** when the timeline is long.
- **CONVENTIONS.md → CONVENTIONS_code.md + CONVENTIONS_review.md + CONVENTIONS_ops.md**.
- **INTEGRATIONS.md → INTEGRATIONS_<service>.md** per major external dependency (only when > 3 services).

## Split mechanics

1. Choose the split axis (component / era / topic).
2. Create files named `<TOPIC>_<axis>.md`.
3. Each split file gets its OWN top matter and its OWN Sources footer.
4. The original `<TOPIC>.md` becomes an **index**:

```markdown
# <Project> — Architecture

> Distilled 2026-07-18 via `distill-project`. Split by component.

- [Backend](./ARCHITECTURE_backend.md)
- [Frontend](./ARCHITECTURE_frontend.md)
- [Data pipeline](./ARCHITECTURE_data.md)

## Sources

_(consolidated across split files)_
```

The index file is small (< 2 KB), which is expected for that pattern — the pass journal records it as `split_index` type, not `failed`.

## Anti-patterns

- **Do not split by arbitrary character count.** Splitting mid-section produces MDs that don't stand alone and each becomes noise in the CPT corpus.
- **Do not merge across topics.** A single MD covers one topic. Combining "architecture and history" into one 30 KB file wastes a chance to teach the model that architecture-shaped and history-shaped content are different.
- **Do not deduplicate content across splits.** If the backend and frontend both talk about how they call the auth worker, both should say it (with their own local context). CPT benefits from repetition of key concepts.

## Chunk-hostile constructs

The downstream paragraph-packer respects blank lines. Avoid:

- Long tables (> 30 rows) — they get treated as one paragraph and can blow past the chunk cap. Break into multiple smaller tables with prose in between.
- Massive code fences (> 100 lines) — same problem. Either shorten to the interesting slice or split the fence with brief prose.
- Single paragraph rants (> 500 chars without a blank line). Break with blank lines at logical boundaries.

## When in doubt, split

The cost of over-splitting is small (a few extra chunk boundaries). The cost of under-splitting is a single huge chunk that either exceeds `MAX_SEQ_LEN` and gets truncated, or dominates a training batch. Split.
