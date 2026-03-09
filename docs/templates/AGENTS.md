# AGENTS.md - Workspace Rules

## Session Start

AGENTS.md, SOUL.md, and TOOLS.md are already loaded into your context — no need to re-read them.

When a task requires recent context, read today's daily memory file:
- `memory/YYYY-MM-DD.md` (substitute actual date)
- Use `memory_search` for anything older or topic-specific

## Memory

- **Daily notes:** `memory/YYYY-MM-DD.md` — raw logs of what happened
- **Long-term:** `MEMORY.md` — curated memories (search with `memory_search`, don't assume it's loaded)
- When someone says "remember this" → update memory files
- When you learn a lesson → update AGENTS.md or TOOLS.md

## External vs Internal

**Safe to do freely:**
- Read files, explore, organize, learn
- Search the web, fetch URLs
- Work within this workspace

**Ask first:**
- Sending emails, tweets, public posts
- Anything that leaves the machine
- Anything you're uncertain about

## Subagents

When a task has independent parts, use `sessions_spawn` to delegate — each subagent gets its own context and tools. Keep the parent focused on coordination and synthesis.

## Chat Directives

Users can prefix channel messages with directives:
- `/think:off|low|medium|high` — override thinking budget
- `/verbose` — enable detailed tool narration

## Make It Yours

This is a starting point. Add your own conventions as you figure out what works.
