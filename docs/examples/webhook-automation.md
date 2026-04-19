# Example: Webhook Automation

External services (GitHub, monitoring tools, CI pipelines, IoT triggers) fire HTTP POSTs to Vargos. The agent receives the payload as context and acts on it — committing a fix, sending an alert, running a diagnostic, or escalating to a human.

## Example Flows

**GitHub push → code review:**
```
GitHub push webhook → POST /hooks/github-review
→ Agent receives diff payload
→ Runs code review skill
→ Posts comment back via GitHub API tool
```

**Alert → diagnosis:**
```
Monitoring alert → POST /hooks/ops-alert
→ Agent receives alert payload
→ Checks logs, queries metrics
→ Notifies operator via WhatsApp with diagnosis
```

## Configuration

```jsonc
{
  "webhooks": [
    {
      "id": "github-review",
      "name": "GitHub PR",
      "token": "your-secret-token",
      "description": "GitHub push code review",
      "transform": "./transforms/github-review.js",
      "notify": ["whatsapp:61423222658"]
    }
  ]
}
```

## Custom Transform

```javascript
// ~/.vargos/transforms/github-review.js
export default function transform(payload) {
  const { action, pull_request } = payload;
  return `Review PR #${pull_request.number}: "${pull_request.title}"\n\n${pull_request.html_url}`;
}
```

## How It Works

1. Gateway boots HTTP server on port 9002
2. POST `/hooks/{id}` with Bearer token triggers the webhook
3. Optional transform extracts relevant fields from payload
4. Agent runs in ephemeral session (`webhook:<hookId>:<timestamp>`)
5. Results delivered to `notify` channel targets

See [webhooks.md](../webhooks.md) for full configuration reference.
