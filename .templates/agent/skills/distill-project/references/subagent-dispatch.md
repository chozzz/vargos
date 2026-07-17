# Subagent Dispatch — Prompt Template

Every pass runs as a subagent invocation. The main skill orchestrator does the dispatch; each subagent gets a fresh context window loaded ONLY with its pass reference plus the config, so topics can't bleed.

## Platform selection

- **Claude Code**: use the `Task` tool with a subagent for the pass.
- **Vargos**: use `runSubagent` (or the `Explore` subagent for read-only recon; `Task` for write output).
- **Fallback**: if no subagent primitive is available, run the pass inline in the main context. Warn that quality will be worse due to context contamination across passes.

## Prompt template

Substitute the placeholders (`{{...}}`) before dispatch.

```
You are the {{PASS_SLUG}} distillation subagent.

Read `{{PASS_REF}}` for detailed pass instructions. It defines your objective,
which sources to mine, and the exact output structure.

Configuration (do not repeat back — reference by field):

{{CONFIG_JSON}}

Project hints to keep you on-domain:

{{HINTS}}

Prior distilled outputs already produced (for cross-reference; do not duplicate):

{{PRIOR_OUTPUTS}}

Constraints:
1. Follow the output template in your PASS_REF exactly. Deviating breaks the
   downstream chunker that consumes these MDs.
2. Every non-obvious claim must have a citation. See
   `references/output-format.md` for citation format.
3. Never fabricate. If you cannot verify a claim from an actual source, write
   `_(none found)_` under that section.
4. Target 15–25 KB. Hard cap 40 KB. If a topic exceeds the cap, split into
   multiple files per `references/chunking.md`.
5. Write your output to: `{{OUTPUT_MD}}`
6. When done, print a one-line summary:
   `DONE {{PASS_SLUG}}: <path> <size> <n_sources>`

You may use these MCP tools if enabled in config:
- fs / git (always available)
- github (if config.mcps.github.enabled)
- jira (if config.mcps.jira.enabled)
- confluence (if config.mcps.confluence.enabled)
- sonarqube (if config.mcps.sonarqube.enabled)

Be exhaustive during discovery. Long distillations are the point — mine
until you have solid citations for every section in the output template, or
have explicit `_(none found)_` acknowledgment. Do not shortcut.

Start now.
```

## What to include in `PRIOR_OUTPUTS`

Only the paths of dependency outputs, not their content. The subagent can `read` them as needed. Example for the `runbooks` pass:

```
- <distilled_path>/OPERATIONS.md  (2026-07-18, 22 KB)
- <distilled_path>/CONTEXT.md     (2026-07-18, 18 KB)
```

Loading these into the initial prompt would waste tokens; the subagent decides whether to open them based on its pass reference guidance.

## Progress reporting

The main skill orchestrator watches the subagent's tool calls and final message. On completion it:

1. Verifies `OUTPUT_MD` exists.
2. Extracts the `DONE <slug>: ...` line from the last message.
3. Reads the Sources footer and counts entries.
4. Appends to `<distilled_path>/.distill-run.json` under `passes[<slug>]`.

If a subagent times out or errors, log `failed: <reason>` and continue with the next pass. The user reviews the failure list at the end.

## Sizing the context budget

Each subagent gets a fresh context. Expected token load per pass:

- Small pass (`codebase-map`, `glossary`): ~30 KB read + ~15 KB write = ~15k tokens total.
- Medium pass (`architecture`, `conventions`): ~100 KB read + ~25 KB write = ~40k tokens.
- Large pass (`history`, `known-issues`, `context`): up to 300 KB of PR/ticket text + ~25 KB write = ~90k tokens.

Set the subagent's max thinking / context appropriately. Vargos: default is fine. Claude Code: use the default `Task` model; opus/sonnet is worth it here for the depth.
