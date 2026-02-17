# Troubleshooting

## Gateway Won't Start

**Port in use:**

```
Error: listen EADDRINUSE :::9000
```

Another process is using port 9000. Either stop it or change the gateway port:

```jsonc
{ "gateway": { "port": 9001 } }
```

**Config missing:**

```
No configuration found
```

Run `vargos` or `pnpm start` to trigger the config wizard, or create `~/.vargos/config.json` manually. See [configuration.md](./configuration.md).

**Stale PID file:**

If `vargos gateway status` reports running but nothing is listening, remove the stale PID file:

```bash
rm ~/.vargos/gateway.pid
vargos gateway start
```

## Model Not Found

```
Model profile "xyz" not found — available: anthropic, openai
```

The `agent.primary` (or `agent.fallback`) references a key that doesn't exist in the `models` map. Check your `config.json`:

```jsonc
{
  "models": { "anthropic": { ... } },
  "agent": { "primary": "anthropic" }   // must match a key in models
}
```

## API Key Issues

**Missing key:**

Set via config or environment variable. Env takes priority:

```bash
export ANTHROPIC_API_KEY=sk-...
```

**Wrong provider:** The env var must match the provider name — `OPENAI_API_KEY` for `openai`, `ANTHROPIC_API_KEY` for `anthropic`, etc.

**Local providers:** Ollama and LM Studio require `"apiKey": "local"` in the model profile (dummy value for Pi SDK auth).

## WhatsApp Issues

**QR won't scan:**

1. Ensure your phone has internet access
2. Try relinking: `rm -rf ~/.vargos/channels/whatsapp/ && vargos gateway restart`
3. Scan the QR code within 30 seconds

**Disconnects after linking:**

Auth state may be corrupted. Delete and re-link:

```bash
rm -rf ~/.vargos/channels/whatsapp/
vargos gateway restart
```

The adapter reconnects automatically with exponential backoff, except for `logged_out` or `forbidden` states.

## Telegram Issues

**Bot not responding:**

1. Verify bot token: `curl https://api.telegram.org/bot<TOKEN>/getMe`
2. Check `allowFrom` — if set, only listed chat IDs receive responses
3. Ensure the bot hasn't been blocked or deactivated

**Finding chat ID:**

```bash
curl https://api.telegram.org/bot<TOKEN>/getUpdates | jq '.result[0].message.chat.id'
```

## Empty Responses

**maxTokens too low:** Increase `maxTokens` in the model profile. Some models default to very low limits.

**Thinking-only response:** The model produced thinking tokens but no text output. This is treated as a successful empty response. Try rephrasing the prompt or using a different model.

## Session Accumulation

Old sessions accumulate in `~/.vargos/sessions/`. To clean up:

```bash
# List sessions
ls ~/.vargos/sessions/

# Remove old sessions (files are base64url-encoded session keys)
rm ~/.vargos/sessions/<filename>.jsonl
```

Run sessions (`cli:run:*`) create new files each execution. Chat sessions (`cli:chat`) reuse the same file.

## Health Check

```bash
vargos health
```

Reports:
- Config validation (missing fields, invalid values)
- Gateway connectivity (WebSocket connection test)
- Service status (registered services and their health)

If health check fails on gateway connectivity, ensure the gateway is running: `vargos gateway start`.
