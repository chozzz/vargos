# Example: Scheduled Research & Reporting

Cron tasks fire on a schedule, trigger the agent to spawn parallel research sub-agents, synthesize findings, and deliver a report to channel targets.

## Example: Daily AI Scan

A 9am daily cron prompts the agent to:
1. Spawn 4 sub-agents in parallel: AI news, GitHub trending, package ecosystem, ArXiv papers
2. Wait for all sub-agents to complete
3. Synthesize into a unified report
4. Deliver to WhatsApp

**Result:** Operator receives a single WhatsApp message with the full report — no manual action required.

## Configuration

Create `~/.vargos/cron/daily-ai-scan.md`:

```yaml
---
id: daily-ai-scan
name: Daily AI Scan
schedule: "0 9 * * *"
enabled: true
notify:
  - whatsapp-vadi-indo:61423222658
---

Research today's AI news, GitHub trending, and package releases. Synthesize into a report.
```

## How It Works

1. Cron service fires scheduled task at configured time
2. Agent runs in cron session (`cron:<taskId>:<timestamp>`)
3. Agent uses `sessions_spawn` to delegate subtasks to child agents
4. Each sub-agent runs independently with its own context
5. Parent synthesizes all results when children complete
6. Results delivered to `notify` channel targets

## Related

- [configuration.md](../configuration.md) — Cron task configuration reference
- [sessions.md](../sessions.md) — Sub-agent lifecycle and session isolation
- [runtime.md](../runtime.md) — Prompt modes for cron vs. chat sessions
