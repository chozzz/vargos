---
name: code-review
description: Structured code review focusing on quality, patterns, and correctness
tags: [code, review]
---

# Code Review

Review code changes for quality, correctness, and maintainability.

## Steps

1. Get the diff — `exec("git diff")` or read the changed files directly
2. Check for:
   - Naming clarity and consistency
   - Error handling gaps
   - Duplication or missed abstractions
   - Edge cases and off-by-one errors
   - Security concerns (injection, auth, data exposure)
   - Performance issues (unnecessary loops, missing indexes)
3. Report findings with `file:line` references
4. Suggest fixes — show the corrected code, not just the problem
5. Acknowledge strengths — note well-written patterns worth preserving

## Guidelines

- Keep feedback actionable — skip trivial style nits unless they affect readability
- Group findings by severity (critical → minor), not by file
- If the change is correct but you'd do it differently, say so without blocking
