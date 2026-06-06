---
name: vargos-skill-creator
description: Create, update, test, benchmark, package, and improve VARGOS skills. Use whenever the user wants to turn a workflow into a skill, create a SKILL.md from scratch, edit an existing skill, add scripts/references/assets, run evals, compare skill behavior against a baseline, or improve a skill description so it triggers more reliably.
---

# VARGOS Skill Creator

Skills give the agent procedural knowledge keyed to conversational triggers, so repeated tasks finish faster with less back-and-forth. A skill can be a lone `SKILL.md`, a deterministic script, a wrapped open-source repo, or the full tree below. Pick the smallest form that does the job.

They live in `~/.vargos/agent/skills/<name>/` and auto-load into VARGOS. Other orchestrators can discover the same directory.

Your job is to locate where the user is in the skill lifecycle, then help them move forward: capture intent, draft or edit the skill, test it on realistic prompts, show results for human review, improve it from feedback, and package it when useful. Stay flexible; if the user only wants to vibe on a draft, do that.

## Core Rules

- **Concise.** Add only what the agent does not already know. Every line must earn its tokens.
- **Progressive disclosure.** Frontmatter is always loaded; body loads on trigger; bundled files load on demand.
- **Imperative body.** Put trigger guidance in `description`, not in a body section called "When to use".
- **Match freedom to fragility.** Use prose for judgment-heavy work, parameterized scripts for repeatable patterns, exact scripts for fragile sequences.
- **No surprises.** Do not create misleading skills, malware, exploit workflows, credential theft, data exfiltration, or unauthorized-access helpers.
- **Explain why.** Prefer short reasoning over heavy-handed rules. If you find yourself writing many all-caps requirements, look for a clearer principle.

## Layout

Maximal form; drop anything unused:

```
<skill-name>/
|-- SKILL.md       required
|-- scripts/       optional - executable, deterministic
|-- references/    optional - loaded on demand
|-- assets/        optional - copied into outputs
`-- evals/         optional - realistic test prompts and assertions
```

Skip `README.md`, `CHANGELOG.md`, and other human-facing project ceremony unless the user explicitly needs it. Skills are agent-facing.

For large reference files over roughly 300 lines, include a short table of contents. When a skill supports multiple domains or frameworks, put shared workflow in `SKILL.md` and split variants into focused files like `references/aws.md`, `references/gcp.md`, or `references/nextjs.md`.

## Frontmatter

Use only `name` and `description` unless VARGOS adds support for more fields.

The description is the primary trigger. Include what the skill does and the contexts where it should be used. Make it specific enough to trigger on natural user phrasing, including cases where the user does not say "skill" explicitly.

```yaml
---
name: pdf-editor
description: Edit, rotate, merge, split, annotate, and repair PDFs. Use when the user asks to modify PDF content, rearrange pages, extract structured content, or automate a repeatable PDF workflow.
---
```

Name rules: lowercase kebab-case, directory name equals `name`, singular noun or verb phrase.

## Writing The Skill

Start by extracting intent from the current conversation before asking questions. If the user says "turn this into a skill," preserve the tools used, sequence of steps, corrections, input formats, output formats, and success criteria already visible in the conversation.

Ask only for missing details that change the result:

- What should this skill enable the agent to do?
- What user phrases, files, or contexts should trigger it?
- What output should it produce?
- What edge cases, dependencies, or examples matter?
- Should this skill have evals? Objective file transforms, extraction, code generation, and fixed workflows usually benefit from them. Subjective writing or taste-heavy design may rely more on human review.

Then write `SKILL.md`:

1. Choose the smallest useful layout.
2. Put all trigger guidance into the frontmatter description.
3. Write the body as direct procedural guidance.
4. Reference bundled files by relative path and say when to read or run them.
5. Add examples only when they reduce ambiguity.
6. Add scripts when repeated work, brittle commands, or exact file generation would otherwise be reinvented.

Script rules: shebang, `set -euo pipefail` for bash, short purpose/input/output header, idempotent behavior, under roughly 80 lines unless complexity is truly necessary.

## Test Prompts

After drafting or materially editing a skill, propose 2-3 realistic prompts a real user would type. Ask whether they look right before running them unless the user already gave explicit test cases.

Save prompts to `evals/evals.json` when creating an eval set:

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "files": []
    }
  ]
}
```

Do not start with brittle assertions. First capture prompts and expected outcomes in plain language. Draft assertions while runs are in progress or after the first human review, when you know what can be checked objectively.

## Eval And Review Loop

Use this loop whenever the environment has enough tooling to run it. If subagents, benchmark scripts, or browser access are unavailable, adapt the same intent: run the prompts, preserve outputs, show the human, collect feedback, then improve.

Add a TodoList item before testing: **Create evals JSON and run `eval-viewer/generate_review.py` so human can review test cases.** Keep it visible until the viewer or a practical fallback has been produced.

Create a sibling workspace named `<skill-name>-workspace/`. Organize each attempt as `iteration-1/`, `iteration-2/`, and so on. Inside each iteration, each eval gets a descriptive directory name, not just `eval-0`.

For each test case, run both the skill and a baseline in the same pass when possible:

- New skill baseline: same prompt without the skill.
- Existing skill baseline: snapshot the old skill first, then run the old version.
- Save skill outputs under `with_skill/outputs/`.
- Save baselines under `without_skill/outputs/` or `old_skill/outputs/`.

For each eval directory, write `eval_metadata.json`:

```json
{
  "eval_id": 0,
  "eval_name": "descriptive-name-here",
  "prompt": "The user's task prompt",
  "assertions": []
}
```

While runs are in progress, draft objective assertions when the skill supports them. Good assertions have descriptive names and can be checked by reading files, parsing outputs, or running a small script. Do not force quantitative assertions onto subjective work.

When timing data is available from task notifications, save it immediately in each run directory as `timing.json`:

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

Grade objective assertions with a reusable script when practical. If grading manually or via subagent, save `grading.json` with this shape because viewers depend on the field names:

```json
{
  "expectations": [
    {
      "text": "Output includes the requested CSV columns",
      "passed": true,
      "evidence": "Found name,email,status in result.csv"
    }
  ]
}
```

If `scripts.aggregate_benchmark` exists in the skill-creator package, aggregate the iteration:

```bash
python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
```

Then generate the human review viewer. Use the provided viewer when available; do not write custom HTML first.

```bash
python <skill-creator-path>/eval-viewer/generate_review.py \
  <workspace>/iteration-N \
  --skill-name "<name>" \
  --benchmark <workspace>/iteration-N/benchmark.json
```

For headless or remote environments, generate a static file instead:

```bash
python <skill-creator-path>/eval-viewer/generate_review.py \
  <workspace>/iteration-N \
  --skill-name "<name>" \
  --benchmark <workspace>/iteration-N/benchmark.json \
  --static <workspace>/iteration-N/review.html
```

For iteration 2 and later, pass `--previous-workspace <workspace>/iteration-(N-1)` when the viewer supports it.

Tell the user where the viewer or static HTML is. Explain that outputs are for qualitative review and benchmark data is for pass rate, time, and token comparisons. If feedback downloads as `feedback.json`, ask the user to place it where you can read it, then use it for the next iteration. Empty feedback means the output was acceptable.

## Improving A Skill

Use feedback to improve the general skill, not just the test examples. Avoid overfitting. If a complaint reveals a broader missing principle, add the principle. If test transcripts show each run inventing the same helper, bundle that helper under `scripts/` and tell the skill when to use it.

Keep the prompt lean. Remove lines that do not affect behavior. Look for instructions that cause wasted work, unnecessary explanation, or repeated setup.

After improving:

1. Apply the skill changes.
2. Rerun the evals into a new iteration directory.
3. Include the same baseline strategy unless there is a better comparison.
4. Generate the review viewer before judging everything yourself.
5. Read feedback, improve again, and repeat until the user is happy, feedback is empty, or progress has plateaued.

For rigorous comparisons, use blind A/B review when subagents and comparator instructions are available. Keep this optional; most skill work only needs the human review loop.

## Description Optimization

After the skill works well, offer to improve the frontmatter description for triggering accuracy.

Create about 20 trigger eval queries: 8-10 should trigger, 8-10 should not trigger. Make them realistic, concrete, and slightly messy: real file names, casual phrasing, near misses, adjacent tasks, ambiguous wording, and cases where another skill might be a better fit. Avoid easy negatives like unrelated programming tasks for a PDF skill.

Review the eval set with the user before optimizing. If an HTML review template exists under `assets/eval_review.html`, use it. Otherwise show a compact table in chat and ask for edits.

If `scripts.run_loop` exists and the environment has the right model CLI, run the optimization loop:

```bash
python -m scripts.run_loop \
  --eval-set <path-to-trigger-eval.json> \
  --skill-path <path-to-skill> \
  --model <current-model-id> \
  --max-iterations 5 \
  --verbose
```

Apply the returned `best_description` only after showing the before/after and scores. If the optimizer is unavailable, revise manually using the eval set and explain the tradeoffs.

## Updating Existing Skills

Preserve the original directory name and frontmatter `name`. If the installed skill may be read-only, copy it to a writable temp location, edit there, and package from the copy. For existing skills, snapshot the pre-edit version before testing so comparisons stay meaningful.

## Packaging

If a package script exists, run it from the skill-creator package:

```bash
python -m scripts.package_skill <path/to/skill-folder>
```

If no package tool exists, leave the skill directory in place and tell the user the path. Do not invent packaging formats.

## Minimal Example

```
git-tidy/
|-- SKILL.md
`-- scripts/prune-merged.sh
```

```markdown
---
name: git-tidy
description: Clean up merged local git branches and identify stale branches. Use when the user asks to prune old branches, tidy a repo after PR merges, or compare local branches against remote merge status.
---

# git-tidy

Run `scripts/prune-merged.sh` from the repo root. Ask for confirmation before deleting branches. Use the `--squashed` mode only when the user wants to inspect branches whose PRs were squash-merged.
```