# Troubleshooting

## Gateway won't start

**Port already in use** (`EADDRINUSE :::9000`): another process holds 9000. Stop it or change `gateway.port` in `~/.vargos/config.json`.

**Config invalid**: `pnpm start` exits with a Zod validation error pointing at the offending key. Schema reference: [`services/config/index.ts`](../../services/config/index.ts).

## Agent silent / sends no reply

Most common cause: the LLM call failed but Pi SDK saved an empty assistant message. Vargos surfaces this as `agent.onCompleted { success: false, error }` and channels send `Error: <message>` back to the user.

Check stdout (or `~/.vargos/logs/`) for an `[agent] ERROR` line. Common errors:

| Error | Fix |
|---|---|
| `No API key for provider: X` | Add API key in `~/.vargos/agent/auth.json` or set `${PROVIDER}_API_KEY` env. |
| `Model not found: X:Y` | `defaultModel` in `agent/settings.json` must match the registry id **exactly**. Pi SDK does exact lookup; mismatch falls through to first-available provider. |
| `Agent execution timeout after 1800000ms` | LLM hung. Check provider status. Default timeout is 30 min. |

If the LLM responds but the message is empty in chat: see `[channels] empty response on success` in stdout. May indicate Pi SDK's `streamingBehavior: 'steer'` interrupted an in-flight prompt with a newer one on the same sessionKey.

## Model resolution

Pi SDK resolves `defaultProvider`+`defaultModel` from `agent/settings.json` via exact `find()`. If wrong, falls through to first available with valid auth. Inspect what loaded:

```bash
head -3 ~/.vargos/sessions/<channel>/<chat>/<latest>.jsonl
```

Look for the `model_change` entry.

## Whitelist / channel rejection

If an inbound message doesn't trigger an agent run, check `allowFrom` on the channel entry. Non-whitelisted senders' messages are appended to history (`skipAgent` path) but the agent isn't invoked. See [`services/channels/pipeline.ts`](../../services/channels/pipeline.ts).

Group chats: bot only runs when @-mentioned or replied-to.

## Empty / stuck responses

| Symptom | Likely cause |
|---|---|
| Bot stays in 🤔 forever | Tool hung mid-call — check `[agent.onTool]` in stdout; restart gateway |
| Heartbeat never delivers | Heartbeat replied `HEARTBEAT_OK` (token pruning skips delivery) — working as designed |
| Model returns no text | Thinking-only or tool-only turn. Try `/think:low` or rephrase. |

## Skill / persona changes don't take effect

- **Personas**: re-read on every `getOrCreateSession`. New sessions for the same channelId pick up edits; cached sessions keep the old persona until eviction or restart.
- **Skills**: Pi SDK reads at session creation. New session sees changes; cached sessions don't.

To force reload: restart the gateway.

## TCP connection failure (external clients)

Gateway listens on `127.0.0.1:9000` over **raw TCP/JSON-RPC** — not HTTP. `curl http://localhost:9000` won't work. Use `nc`:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"bus.search","params":{}}' | nc -q 1 127.0.0.1 9000
```

## Debug logs

```bash
LOG_LEVEL=debug pnpm start
```

Adds verbose logging and writes per-session debug files (`systemPrompt.md`, `customTools.md`, etc.) to each session dir. See [Debugging](../debugging.md).

## See also

- [Debugging](../debugging.md) — log inspection and bus introspection
- [Configuration](../configuration.md) — config schema
