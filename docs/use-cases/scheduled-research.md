# Use Case: Scheduled Research & Reporting

## Summary

Cron tasks fire on a schedule, trigger the agent to spawn parallel research sub-agents, synthesize findings, and deliver a report to one or more channel targets (e.g. WhatsApp).

## Example

A 9am daily cron prompts the agent to:
1. Spawn 4 sub-agents in parallel: AI news, GitHub trending, package ecosystem, ArXiv papers
2. Wait for all sub-agents to complete
3. Synthesize into a unified report
4. Deliver to `whatsapp:61423222658`

The operator receives a single WhatsApp message with the full report — no manual action required.

## How It Works

- **Cron** (`src/cron/`) fires the task → `AgentService` runs it in a cron session
- **`sessions_spawn`** tool spawns child sessions for parallel research
- Each sub-agent runs independently, posts `subagent_announce` on completion
- Parent agent re-triggers, synthesizes all results
- `notify` array on the cron task delivers the final response to channel targets

## Config

```json
{
  "cron": {
    "tasks": [
      {
        "id": "daily-ai-scan",
        "name": "Daily AI & Tech Scanner",
        "schedule": "0 9 * * *",
        "task": "Research today's AI news, GitHub trending, and package releases. Synthesize into a report.",
        "notify": ["whatsapp:61423222658"]
      }
    ]
  }
}
```

## Known Issue

Multiple sub-agents completing at staggered intervals cause the parent to re-synthesize on each wave, producing multiple notify deliveries instead of one. See `bugs/subagent-storm.md`.

## Notes

- Cron sessions are separate from user/channel sessions — they don't pollute conversation history
- Cron sessions older than 7 days are reaped automatically
- Heartbeat cron (every 30 min) handles background maintenance separately
