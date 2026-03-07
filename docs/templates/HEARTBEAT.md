# HEARTBEAT.md

# Keep this file empty (or with only comments) to skip heartbeat API calls.

## Tasks
<!-- Executable, bounded tasks the agent runs on each heartbeat poll -->
- Write today's daily note to `memory/YYYY-MM-DD.md`. Search recent sessions (last 24h) for notable events, decisions, lessons, and tasks. Summarize concisely — skip routine greetings and small talk. If today's file already exists, append new items only.
- Scan memory/*.md for old files not referenced in MEMORY.md. Summarize key facts into MEMORY.md, then delete.
- Check MEMORY.md for stale entries. Compact if bloated.
- Review AGENTS.md, SOUL.md, and TOOLS.md for stale or outdated content. Update or remove.

## Notes
<!-- Guidance the agent reads but does not act on during heartbeat -->
- Bootstrap files (AGENTS, SOUL, TOOLS) are injected into every session — keep them lean.
- Prefer deleting stale content over accumulating disclaimers.
- Memory pipeline: sessions → daily notes (heartbeat) → MEMORY.md (curated long-term) → memory_search (retrieval).
