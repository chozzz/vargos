# Workflow: Inspect And Distill

## Step 0: Load Config

Read `distill-jsonl-config.json`. Resolve globbed inputs, output directory, enabled lanes, privacy rules, and optional project/MCP identifiers.

If inputs are missing or empty, stop and ask for a valid path. Do not scan unrelated home directories by default.

## Step 1: Inventory Sources

For each input file, record:

- Path.
- Size.
- Approximate line count.
- Parse success/failure count from a small sample.
- Timestamp range if visible.
- Detected schema family.

Write early findings to `SCHEMA_MAP.md` if that lane is enabled.

## Step 2: Detect Schema

Use `references/schema-detection.md` to identify fields for:

- message role or speaker.
- text/content.
- tool calls and tool outputs.
- timestamps.
- files referenced.
- session or conversation ID.
- model/agent metadata.

If a file mixes schemas, split processing by detected record family.

## Step 3: Privacy Pass

Apply `references/privacy-redaction.md` before extracting reusable output. Keep a redaction log with counts and categories, not raw sensitive values.

## Step 4: Dispatch Lanes

For large inputs, spawn one subagent per enabled lane. Give each subagent:

- config.
- schema map.
- assigned input shards or line ranges.
- privacy rules.
- lane-specific output target.
- extraction taxonomy.

Do not ask one subagent to do every lane across a large transcript set.

## Step 5: Merge And Deduplicate

Merge lane outputs. Deduplicate repeated preferences, decisions, commands, and lessons. Prefer the most recent or best-sourced statement, but preserve conflicting evidence under `Conflicts`.

## Step 6: Route SFT Candidates

If `lanes.sft-candidates` is true, read `references/cpt-vs-sft-routing.md` and emit JSONL only for clean examples. Otherwise, do not generate SFT rows.

## Step 7: Write Index

Create `INDEX.md` with:

- input coverage.
- outputs and sizes.
- extraction counts.
- confidence summary.
- redaction summary.
- low-confidence or human-review items.

## Step 8: Final Report

Show the user output paths and a concise summary. Mention any skipped lanes, unreadable files, or redaction-heavy sources.
