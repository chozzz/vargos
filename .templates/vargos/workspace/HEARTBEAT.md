# HEARTBEAT.md — Task Checklist

## Primary Tasks

1. **Write today's daily summary** (${WORKSPACE_DIR}/memory/YYYY-MM-DD.md)
   - Search recent sessions from last 24h using memory.search with broad queries
   - Include: decisions made, bugs fixed, learnings, artifacts, external context
   - Note: WhatsApp conversations (whatsapp-*), Telegram (telegram-*), CLI sessions (cli-*), cron outputs
   - Format: 20-50 lines, grouped by topic
   - Exclude: tool noise, repetitive logs, failed commands

2. **Curate memory**
   - List dated files in ${WORKSPACE_DIR}/memory/
   - For any dated >14 days old: extract key facts, promote to topic files at ${WORKSPACE_DIR}/memory/<topic>.md
   - Update ${WORKSPACE_DIR}/MEMORY.md index to point to new topic files
   - Delete promoted daily files

3. **Prune stale pointers**
   - Review ${WORKSPACE_DIR}/MEMORY.md (should be <50 lines)
   - Remove any broken links or outdated topics
   - Consolidate overlapping topic files

4. **Bootstrap hygiene** (keep each <6000 chars)
   - Review staleness: ${WORKSPACE_DIR}/AGENTS.md, SOUL.md, TOOLS.md only
   - Move reference data to ${WORKSPACE_DIR}/memory/<topic>.md files as needed
   - Note any findings in daily summary

5. **Workspace cleanup**
   - Remove or relocate one-off root files that no longer belong in the bootstrap surface
   - Keep durable reference material in topic memory files, not ad hoc root documents
   - Preserve user-created files unless they are clearly obsolete or the user asked for cleanup

6. **Skill hygiene**
   - Review repeated workflows, useful procedures, and durable know-how
   - If a pattern would help future agents, recommend creating or updating a skill instead of bloating AGENTS.md, SOUL.md, or TOOLS.md
   - Do not create or update skills during heartbeat unless the user already asked for it; include a concise recommendation in the heartbeat output instead
   - Keep skills focused on repeatable procedures, not one-off notes

