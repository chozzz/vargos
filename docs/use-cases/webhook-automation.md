# Use Case: Webhook Automation

## Summary

External services (GitHub, monitoring tools, CI pipelines, IoT triggers) fire HTTP POSTs to Vargos. The agent receives the payload as context and acts on it — committing a fix, sending an alert, running a diagnostic, or escalating to a human.

## Example Flows

**GitHub push → code review:**
```
GitHub push webhook → POST /webhook/github-review
→ Agent receives diff payload
→ Runs code review skill
→ Posts comment back via GitHub API tool
```

**Alert → diagnosis:**
```
Monitoring alert → POST /webhook/ops-alert
→ Agent receives alert payload
→ Checks logs, queries metrics
→ Notifies operator via WhatsApp with diagnosis
```

## Config

```json
{
  "webhooks": [
    {
      "id": "github-review",
      "path": "/webhook/github-review",
      "secret": "...",
      "task": "Review the pushed code diff and post findings.",
      "notify": ["whatsapp:61423222658"]
    }
  ]
}
```

## How It Works

`WebhookService` exposes HTTP endpoints (default port 9002). Each webhook config maps a path to an agent task. The request body is injected as context. Optional HMAC secret validation. Results delivered to `notify` targets.

## Notes

- Webhook sessions are ephemeral — reaped after 3 days
- `notify` delivery shares the same subagent-storm issue as cron (see `bugs/subagent-storm.md`)
- Payload transform: raw body passed as user message; agent sees it as a task with context
