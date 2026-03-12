# HEARTBEAT.md

# Keep this file empty (or with only comments) to skip heartbeat API calls.

## Tasks
<!-- Executable, bounded tasks the agent runs on each heartbeat poll -->
- Write today's daily note to `memory/YYYY-MM-DD.md`. Search recent sessions (last 24h) for notable events, decisions, lessons, and tasks. Summarize concisely — skip routine greetings and small talk. If today's file already exists, append new items only.
- Curate memory: promote key facts from daily files older than 14 days into topic files (`memory/<topic>.md`), update MEMORY.md index with pointers, delete the source daily file.
- Prune: remove stale MEMORY.md pointers and merge overlapping topic files.
- Clean: delete one-off workspace files (`*-report.md`, `*-plan.md`, `*-analysis.md`) after extracting value into topic files.
- Review AGENTS.md, SOUL.md, and TOOLS.md for stale or outdated content. Update or remove.

## Notes
<!-- Guidance the agent reads but does not act on during heartbeat -->
- Bootstrap files (AGENTS, SOUL, TOOLS) are injected into every session — keep each under 6000 chars (truncated beyond that). Move reference data to `memory/` topic files.
- MEMORY.md is an index — store content in `memory/<topic>.md` files, not in MEMORY.md itself.
- MEMORY.md should stay under 50 lines.
- Prefer deleting stale content over accumulating disclaimers.
- Memory pipeline: sessions → daily notes (heartbeat) → topic files (curated) → MEMORY.md (index) → memory_search (retrieval).
