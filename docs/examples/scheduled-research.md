# Example: Scheduled Research & Reporting

Cron tasks fire on a schedule, the agent runs the prompt, and `notify` channels receive the result via `channel.send` (with `fromSessionKey` so the channel agent records the source).

## Example: Daily AI scan

A 9am daily cron prompts the agent to research and synthesize, then delivers to WhatsApp.

Create `~/.vargos/cron/daily-ai-scan.md`:

```yaml
---
id: daily-ai-scan
name: Daily AI Scan
schedule: "0 9 * * *"
enabled: true
notify:
  - whatsapp-personal:+614XXXXXXXXX
activeHours: [8, 22]
activeHoursTimezone: "Australia/Sydney"
---

Research today's AI news, GitHub trending, and package releases via web.fetch.
Spawn parallel subagents for each angle (use agent.execute with sub-session keys).
Synthesize into a single report under 800 words.
```

## How it works

1. Cron service fires at 9am Sydney (within active hours).
2. Agent runs in session `cron:daily-ai-scan:2026-05-06`.
3. Agent uses `agent.execute` to spawn parallel subagents on `cron:daily-ai-scan:2026-05-06:subagent:<topic>`. Each runs independently.
4. Parent synthesizes and returns the final report.
5. `services/cron/index.ts` calls `channel.send` with `fromSessionKey: cron:daily-ai-scan:2026-05-06`.
6. WhatsApp gets the report; the channel session's history records `[cron:daily-ai-scan:2026-05-06] <report>` so future replies have context.

## Related

- [Configuration](../configuration.md) — cron task schema
- [Sessions](../usage/sessions.md) — subagent sessionKey format and lifecycle
- [Runtime](../usage/runtime.md) — cross-session injection via `fromSessionKey`
