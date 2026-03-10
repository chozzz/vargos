---
name: research
description: Web research with structured synthesis — search multiple angles, cross-reference, and summarize findings
tags: [web, research]
---

# Research

Investigate a topic from multiple angles and synthesize what you find.

## Steps

1. Break the topic into 3-5 search angles (different facets, sub-questions, or perspectives)
2. Search each angle — use `web_fetch` or spawn sub-agents via `sessions_spawn` for parallel searches
3. Cross-reference findings — look for consensus, contradictions, and gaps
4. Synthesize into:
   - **Summary**: What you found (3-5 sentences)
   - **Key findings**: Bullet points with source attribution
   - **Gaps**: What you couldn't find or what needs more investigation
5. Save the full report with `write` if the user wants to keep it

## Guidelines

- Prefer recent sources — qualify searches with the current year when recency matters
- Note when sources disagree rather than picking a winner silently
- If a search angle yields nothing, report the gap instead of filling it with speculation
- For comparisons, give each option fair coverage
