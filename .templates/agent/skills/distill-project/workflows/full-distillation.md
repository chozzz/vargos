# Full Distillation Workflow

Executes all 10 passes. Each pass dispatches one subagent. Passes run **sequentially** so later ones can read earlier outputs — parallelism doesn't help CPT quality here and makes citation cross-referencing harder.

## Step 0 — Load config and probe environment

1. Read `distill-config.json` (path resolved by SKILL.md).
2. Confirm `distilled_path` exists; `mkdir -p` if needed.
3. For each MCP where `config.mcps.<name>.enabled == true`, do a minimal health check:
   - **github** — one lightweight call (e.g. list open PRs for the configured repo), expect a non-error response.
   - **jira** — one JQL search on the configured project, expect a valid response.
   - **confluence** — one search in the configured space, expect a valid response.
   - **sonarqube** — one project-status call, expect a valid response.
   Skip probes entirely for MCPs where `enabled == false` or the block is missing.
4. Record availability in a scratch `<distilled_path>/.distill-run.json`:
   ```json
   {"started_at": "...", "config": {...}, "mcp_status": {"github": "ok", "jira": "unavailable", "confluence": "disabled", "sonarqube": "disabled"}}
   ```
5. Announce which passes will run, which MCPs are usable (`ok` / `unavailable` / `disabled`), and estimated wall time. Baseline estimate: ~5 min per pass with fs+git only; +5 min per additional enabled MCP that a pass consults.

## Step 1..10 — Passes

For each pass in `config.passes` where the value is `true`, in the order below, dispatch a subagent. Use the prompt template from `references/subagent-dispatch.md`, substituting:

- `PASS_SLUG` = the pass name.
- `PASS_REF` = `references/passes/<slug>.md` (subagent reads this first).
- `OUTPUT_MD` = `<distilled_path>/<UPPER>.md` per the table in SKILL.md.
- `CONFIG_JSON` = full config so the subagent knows MCP ids.
- `HINTS` = `config.hints` block verbatim.
- `PRIOR_OUTPUTS` = paths of any dependency outputs already on disk (see SKILL.md table).

Wait for each subagent to complete before dispatching the next. On completion:

1. Verify `OUTPUT_MD` exists and is ≥ 2 KB. If missing or too short, log to `.distill-run.json` as `failed: true` and continue (do not block the whole sweep).
2. Extract a Sources-count from the MD footer, log to `.distill-run.json`.
3. Move on.

Order:

| # | Slug         | Rationale for position                                       |
|---|--------------|--------------------------------------------------------------|
| 1 | codebase-map | Ground truth of what exists. Cited by 1, 5, 8.               |
| 2 | architecture | Depends on codebase-map for component list.                  |
| 3 | history      | Independent; git + PR mining.                                |
| 4 | conventions  | Independent; CLAUDE.md/AGENTS.md/PR-review mining.           |
| 5 | context      | Independent; confluence + product-side sources.              |
| 6 | integrations | Reads codebase-map for the package list.                     |
| 7 | operations   | Reads integrations to know what needs deploying.             |
| 8 | known-issues | Reads history for context on why bugs recur.                 |
| 9 | glossary     | Reads context + conventions to harvest jargon.               |
| 10 | runbooks    | Reads operations + context to sequence real workflows.       |

## Step 11 — Summary

After all passes:

1. Read every emitted MD, count size and Sources-lines.
2. Print a table:
   ```
   PASS               OUTPUT                    SIZE     SOURCES
   codebase-map       CODEBASE.md               18KB     23
   architecture       ARCHITECTURE.md           27KB     41
   ...
   ```
3. Print any splits produced (e.g., `ARCHITECTURE_frontend.md`).
4. Print the total distilled corpus size (`du -sh <distilled_path>`).
5. Write final `.distill-run.json` with per-pass status, wall time, and totals.
6. Tell the user which passes to spot-review first — always suggest `ARCHITECTURE.md` and `CONTEXT.md`, then the two largest MDs by size, then any pass flagged `failed`.

Do **not** attempt to grade quality. Human review is the acceptance gate.
