# Webhooks

Webhooks let external services trigger agent tasks via HTTP. A GitHub push, a monitoring alert, or any HTTP POST can fire an agent run with the webhook payload as context.

## How It Works

1. Define hooks in `config.json` with an ID and auth token
2. Gateway boots a lightweight HTTP server on the configured port
3. External service sends `POST /hooks/{id}` with a Bearer token
4. Vargos creates a fresh session (`webhook:<hookId>:<timestamp>`), applies an optional transform to the payload, and fires a `webhook.trigger` event
5. The agent service picks up the event, runs the task, and optionally delivers results to channel targets

## Configuration

```jsonc
{
  "webhooks": {
    "port": 9002,
    "host": "127.0.0.1",
    "hooks": [
      {
        "id": "github-pr",
        "token": "your-secret-token",
        "description": "GitHub pull request events",
        "transform": "./transforms/github.js",
        "notify": ["whatsapp:614..."]
      }
    ]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | URL-safe identifier (`[a-z0-9_-]+`) |
| `token` | string | yes | Bearer token for authentication |
| `transform` | string | no | Module path for custom payload transform |
| `notify` | string[] | no | Channel targets for result delivery |
| `description` | string | no | Human-readable description |

## HTTP Endpoint

```
POST /hooks/{hookId}
Authorization: Bearer <token>
Content-Type: application/json

{ "action": "opened", "pull_request": { ... } }
```

**Response:** `200 OK` (fire-and-forget — the agent runs asynchronously)

**Error codes:**
- `400` — invalid hook ID format
- `401` — missing or invalid token
- `404` — unknown hook ID
- `413` — payload exceeds 1MB limit

Token comparison uses timing-safe equality to prevent timing attacks.

## Custom Transforms

By default, the raw JSON payload is stringified and passed as the agent task. Custom transforms let you extract relevant fields:

```javascript
// ~/.vargos/transforms/github.js
export default function transform(payload) {
  const { action, pull_request } = payload;
  return `GitHub PR ${action}: "${pull_request.title}" by ${pull_request.user.login}\n\nURL: ${pull_request.html_url}`;
}
```

The transform module must export a function `(payload: unknown) => string`. Transform paths resolve relative to the data directory. Transforms are cached after first load.

## Notification Routing

When `notify` is set on a hook, the agent delivers its response to each target after completing the task:

```jsonc
{
  "notify": [
    "whatsapp:61400000000",
    "telegram:123456789"
  ]
}
```

This uses the same delivery mechanism as cron task notifications — results are injected into the recipient's channel session for context, then sent via `channel.send`.

## CLI Commands

```bash
vargos webhooks list      # Show configured webhooks (tokens hidden)
vargos webhooks status    # Show fire stats (last fired, total fires)
```

## Gateway Protocol

| Method/Event | Type | Description |
|-------------|------|-------------|
| `webhook.list` | method | List configured hooks (tokens stripped) |
| `webhook.status` | method | Get fire stats for all hooks |
| `webhook.trigger` | event | Emitted when a webhook fires |

The `webhook.trigger` event payload:

```typescript
{
  hookId: string;
  task: string;          // transformed payload text
  sessionKey: string;    // webhook:<hookId>:<timestamp>
  notify?: string[];     // channel targets
}
```

See [configuration.md](./configuration.md) for the full config reference and [architecture.md](./architecture.md) for the gateway protocol.
