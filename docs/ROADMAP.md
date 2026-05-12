# Roadmap

Planned features for Vargos. For shipped features, see [FEATURES.md](../FEATURES.md).

## Voice integration

Inbound and outbound voice support.

- Twilio phone channel adapter
- STT/TTS bridge (LocalAI or hosted)
- Transparent transcription of WhatsApp/Telegram voice notes
- Optional voice replies
- `phone_call(to, instructions, persona?)` tool — initiates Twilio call, spawns a subagent session for autonomous voice conversation, returns transcript
- Hospitality / concierge persona pack for caller-ID-driven sessions

## More channels

- **Slack** — Bolt SDK or Socket Mode + xoxb tokens. Single biggest gap.
- Discord, Signal, Matrix, Teams (lower priority)

## Web UI / Observability

`WebService` exposing agent runs, sessions, cron, channels, config via HTTP + SSE. Real-time streaming deltas, tool execution visibility, session history viewer, cron management. Bearer-token auth like the MCP bridge.

## Re-enable disabled edge services

Both currently commented out in [`index.ts`](../../index.ts):

- [`edge/mcp/`](../../edge/mcp/) — MCP server (HTTP, port 9001)
- [`edge/webhooks/`](../../edge/webhooks/) — webhook receiver (HTTP, port 9002)

Bring them back when the surface stabilizes.

## Session cost tracking

Token usage + cost per session / channel / cron task. Daily/weekly aggregation, budget alerts via channel notification.

## Media enhancements

- Image description fallback for non-vision models
- Image size limits + compression
- Document extraction parity for WhatsApp (currently Telegram-only)

## Agent enhancements

- Model switching mid-session
- Compaction config exposure
- Per-model/per-session thinking budget
- Session export/import

## Tighter loops

- File-watcher-driven persona reload (currently re-read on session creation; would benefit from cache invalidation on write)
- `bus.notify` for opt-in pub/sub patterns beyond the current `agent.on*` events

## See also

- [FEATURES.md](../FEATURES.md) — what's shipped
