# Use Case: Guest Voice Agent (Hospitality)

## Summary

Inbound Twilio calls from known guests are routed to a personalized voice agent loaded with the guest's profile and a shared skill pack (e.g. hotel concierge). Each call runs as an isolated session.

## Flow

1. Guest calls Twilio number → `TwilioAdapter` receives inbound
2. Caller ID looked up via `resolveGuest(callerId)` → loads `~/.vargos/workspace/guests/<id>.md`
3. Session created: `twilio:<phoneNumber>:<callSid>` — isolated per call
4. `bootstrapOverrides` injects guest persona (SOUL.md equivalent) + guest skills
5. `VoiceSession` handles STT → LLM → TTS loop for the conversation
6. Call ends → session archived

## Guest Profile (`~/.vargos/workspace/guests/<id>.md`)

```yaml
---
name: John Smith
phone: "+61423222658"
language: en-AU
skills: [hotel-concierge, local-recommendations]
context: "VIP guest, room 412, checking out 2026-03-22"
---
```

## Requirements

- Phase 1 (Voice Foundation) + Phase 4 (Guest Agent) — see `plans/voice-web-plugins.md`
- Open decision D1: fast local LLM for real-time voice
- Open decision D3: guest registry — file-based vs. PMS API sync
- Open decision D5: call recording and consent

## Notes

- Unknown callers fall back to a default persona (no guest file found)
- Concurrent calls are isolated by `callSid` — safe for multiple simultaneous guests
- Skills loaded same as `sessions_spawn` skill injection
