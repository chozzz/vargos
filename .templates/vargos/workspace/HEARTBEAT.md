# HEARTBEAT.md — Task Checklist

## Primary Tasks

1. **Write today's daily summary** (${WORKSPACE_DIR}/memory/daily/YYYY-MM-DD.md)
   - Search recent sessions from last 24h using memory.search with broad queries
   - Include: decisions made, bugs fixed, learnings, artifacts, external context
   - Note: WhatsApp conversations (whatsapp-*), CLI sessions (cli-*), cron outputs
   - Format: 20-50 lines, grouped by topic
   - Exclude: tool noise, repetitive logs, failed commands

2. **Curate memory**
   - List files in ${WORKSPACE_DIR}/memory/daily/
   - For any dated >14 days old: extract key facts, promote to topic files at ${WORKSPACE_DIR}/memory/
   - Update ${WORKSPACE_DIR}/MEMORY.md index to point to new topic files
   - Delete promoted daily files

3. **Prune stale pointers**
   - Review ${WORKSPACE_DIR}/MEMORY.md (should be <50 lines)
   - Remove any broken links or outdated topics
   - Consolidate overlapping topic files

4. **Bootstrap hygiene** (keep each <6000 chars)
   - Review staleness: ${WORKSPACE_DIR}/*.md
   - Move reference data to ${WORKSPACE_DIR}/memory/ topic files as needed
   - Note any findings in daily summary
   - Remove all past sessions' .jsonl files and its directory once its been reviewed.
