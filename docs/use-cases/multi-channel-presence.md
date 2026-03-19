# Use Case: Multi-Channel Presence

## Summary

A single agent instance reachable across WhatsApp, Telegram, and CLI simultaneously. Each channel maintains its own session and conversation history. The agent behaves consistently regardless of which channel the user contacts it through.

## How It Works

Each channel runs as a `ChannelAdapter` inside the gateway process. Inbound messages arrive as `message.received` events → `AgentService` queues them per session → runs the agent → delivers response back through the originating adapter.

Session keys are channel-scoped (`whatsapp:<phone>`, `telegram:<chatId>`, `cli:<id>`), so conversations are isolated but the same agent runtime, tools, memory, and workspace serve all of them.

## What's Supported Today

| Channel | Status | Notes |
|---------|--------|-------|
| WhatsApp | Live | Baileys (multi-device), voice notes, media in/out, reactions, typing indicators |
| Telegram | Live | Bot API, voice/audio, media in/out, reactions |
| CLI | Live | Interactive chat and one-shot `run` mode |

## Planned Channels

| Channel | Status | Notes |
|---------|--------|-------|
| Twilio Voice | Planned (Phase 1) | Inbound/outbound phone calls via VoiceSession |
| Browser (WebRTC) | Planned | Text + voice + video directly in browser tab |
| Slack | Planned | ChannelAdapter using Slack Events API |

## Notes

- Messages debounced per sender (default 2s) to batch rapid inputs before triggering a run
- Typing indicators and emoji status reactions work on WhatsApp and Telegram
- Markdown stripped from all outbound text — plain text regardless of model output
- `allowFrom` config whitelist per channel for access control
- Telegram long-polling resumes from offset 0 on boot, so any messages sent while the adapter was offline are delivered immediately on reconnect — no messages are lost during restarts
