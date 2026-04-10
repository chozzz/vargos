# Roadmap

Planned features for Vargos.

## Voice Integration

**Status:** Not started

Inbound and outbound voice support via Twilio and LocalAI.

### Inbound Voice (Twilio)
- Twilio phone channel adapter
- STT/TTS bridge via LocalAI (port 8090)
- Transparent transcription of WhatsApp/Telegram voice notes
- Optional voice replies (`voiceReplyMode: always | mirror | never`)

### Outbound Voice Calls
- `phone_call(to, instructions, persona?)` tool
- Initiates Twilio call, spawns subagent session for autonomous voice conversation
- Returns transcript + summary
- Use case: cron tasks that need to call and gather information

### Guest Voice Agent Plugins
- Hospitality support: resolve caller ID → load guest profile + persona
- Voice session with shared hotel-concierge skill pack
- Concurrent calls isolated per callSid

## Web UI / Observability

**Status:** Not started

New `WebService` exposing agent runs, sessions, cron tasks, channels, and config via HTTP + Server-Sent Events.

- Real-time streaming deltas and tool execution visibility
- Session history viewer
- Cron task management
- Channel connection status
- Same auth pattern as MCP bridge (bearer token)

## Session Cost Tracking

**Status:** Not started

Track token usage and cost per session, per channel, per cron task.

- Per-model cost calculation
- Daily/weekly/monthly aggregation
- Budget alerts via channel notification

## Media Enhancements

**Status:** Partially implemented

- [x] Audio transcription (Whisper API)
- [x] Image passthrough (vision models)
- [ ] Image description fallback for non-vision models
- [ ] Media transform storage (searchable media history)
- [ ] Image size limits and compression

## Agent Enhancements

**Status:** Partially implemented

- [x] Streaming events passthrough to bus
- [x] Subagent orchestration via `agent.execute`
- [ ] Model switching mid-session
- [ ] Compaction configuration exposure
- [ ] Thinking budget configuration per model/session
- [ ] Session export/import
