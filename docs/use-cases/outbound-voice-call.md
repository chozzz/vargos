# Use Case: Cron-Triggered Outbound Voice Call

## Summary

A cron task prompts the agent to call a phone number, conduct a conversation, and report findings back to the operator.

**Example trigger:**
> "Call +61423000000 and ask about their insurance renewal. Summarize the outcome and notify me."

## Flow

1. Cron fires → agent receives task
2. Agent invokes `phone_call(to, instructions, persona?)` tool
3. Tool initiates Twilio outbound call → spawns `VoiceSession`
4. `VoiceSession` runs STT → LLM → TTS loop for the conversation
5. Call ends → tool returns `{ transcript, summary, durationMs }`
6. Agent synthesizes report, delivers via cron `notify` targets (e.g. WhatsApp)

## Requirements

- Phase 1 (Voice Foundation) + Phase 3 (Outbound Calls) — see `plans/voice-web-plugins.md`
- Open decision D1: fast local LLM for real-time voice (Claude too slow at ~400ms budget)
- Open decision D2: max call duration and sync vs. async pattern

## Notes

- `phone_call` blocks the session queue for the call duration — cap duration or switch to async (`subagent_announce`) for calls > 5 minutes
- Cron notify delivery must fire only once (see bug: `bugs/subagent-storm.md`)
