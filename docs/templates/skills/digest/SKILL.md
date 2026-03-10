---
name: digest
description: Summarize long content (URLs, files, threads) into structured bullet points
tags: [writing, productivity]
---

# Digest

Condense long-form content into something scannable.

## Steps

1. Acquire the content:
   - URL → `web_fetch`
   - File → `read`
   - Inline text → use directly
2. Produce:
   - **TL;DR**: 1-2 sentences
   - **Key points**: 3-7 bullets capturing what matters
   - **Action items**: If the content implies tasks or decisions, list them
3. Store key facts with `memory_write` if they'll be needed later

## Guidelines

- Preserve numbers, dates, names, and specific claims exactly
- For transcripts and meetings, prioritize decisions and action items over discussion
- For technical content, focus on what's actionable or what changed
- Skip empty sections — if there are no action items, don't include the heading
- Channel output should be TL;DR + bullets only; CLI can be longer
