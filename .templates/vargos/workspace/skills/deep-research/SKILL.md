---
name: deep-research
description: In-depth research using parallel sub-agents to cover multiple angles simultaneously, then synthesize
tags: [research, web]
---

# Deep Research

Thorough investigation that spawns parallel sub-agents for breadth, then synthesizes for depth.

## Steps

1. Decompose the topic into 3-5 independent search angles
2. Spawn a sub-agent per angle via `sessions_spawn` — each one searches and summarizes its findings
3. Wait for all results
4. Synthesize across angles:
   - **Summary**: What the evidence says (3-5 sentences)
   - **Findings**: Key points per angle with source attribution
   - **Contradictions**: Where sources disagree and why
   - **Gaps**: What couldn't be found or needs further work
   - **Recommendations**: If the user needs a decision, give one
5. Save the full report with `write` if needed

## When to use this vs `research`

Use `research` for straightforward questions that need a few searches. Use `deep-research` when the topic is broad, contested, or requires comparing many sources in parallel.

## Guidelines

- Each sub-agent should be given a focused, self-contained task
- Prefer recent sources — add the current year to queries when recency matters
- Report gaps honestly instead of filling them with speculation
- Cross-reference claims across sub-agent results before including them
