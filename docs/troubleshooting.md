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

## Empty Responses

**maxTokens too low:** Increase `maxTokens` in the model profile. Some models default to very low limits.

**Thinking-only response:** Model returned thinking tokens but no text. See [runtime.md](./runtime.md#empty-response-handling) for retry behavior. Try rephrasing or switching models.

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
