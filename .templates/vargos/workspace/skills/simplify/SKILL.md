---
name: simplify
description: Review recent code changes for reuse opportunities, quality issues, and inefficiencies — then fix them
tags: [code, review]
---

# Simplify

Review changed code for reuse, quality, and efficiency. Fix issues directly.

## Steps

1. Get the diff — `exec("git diff")` or `exec("git diff HEAD")` if staged
2. Three passes over each change:

**Reuse** — Does this duplicate something that already exists in the codebase? Search for similar utilities, helpers, or patterns before accepting new code.

**Quality** — Redundant state, copy-paste with slight variation, magic strings where constants exist, leaky abstractions, unnecessary nesting.

**Efficiency** — Redundant computations, sequential operations that could be parallel, unbounded collections, missing cleanup, existence checks before operations (just operate and handle the error).

3. Fix what you find. Skip false positives without commentary.
4. Briefly summarize what was fixed, or confirm the code was clean.
