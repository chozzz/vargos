# Implementation Plan: Voice, Web UI, and Plugin Architecture

This doc captures all settled decisions, phased work, and open product questions
from the architectural review. Use it to resume implementation in any future session.

---

## Settled Decisions

### Voice (STT / TTS / Twilio)

| Decision | Verdict |
|---|---|
| STT/TTS placement | `src/lib/voice.ts` — pure functions, no gateway service |
| STT integration point | Transparent, inside each adapter's `handleMedia()` — agent sees transcript as text |
| Inbound voice metadata | `metadata.voice = { originalPath, durationMs, mimeType }` + `metadata.transcribed: false` on failure |
| TTS reply trigger | `voiceReplyMode: 'always' \| 'mirror' \| 'never'` per channel. Mirror = reply as voice only when inbound was voice |
| Twilio adapter type | `VoiceChannelAdapter extends ChannelAdapter` — owns its own HTTP server for TwiML webhooks |
| VoiceChannelAdapter methods | `startProcessing(callSid)`, `stopProcessing(callSid)`, `dial(to): Promise<string>` |
| Outbound call model | Tool-based: `phone_call(to, instructions, persona?)` tool blocks until call ends, returns transcript |
| Voice conversation loop | Purpose-built `VoiceSession` (NOT Pi SDK) — tight STT→LLM→TTS loop for sub-second latency |
| Session key for calls | `twilio:<phoneNumber>:<callSid>` |
| Guest registry location | `~/.vargos/workspace/guests/<id>.md` — YAML frontmatter (name, phone, language, skills[], context) |
| Guest persona injection | `bootstrapOverrides: { 'SOUL.md': guestPersona }` + skills loaded like `sessions_spawn` |
| Guest session model | `full` prompt mode, `channel: 'twilio'` — one session per callSid, concurrent-safe |

### Web UI / Observability

| Decision | Verdict |
|---|---|
| Architecture | New `WebService` (`src/web/`) — ServiceClient pattern, HTTP+SSE on port 9003 |
| Real-time | SSE: WebService subscribes to gateway events, fans out to browser clients |
| Auth | Bearer token (`config.web.bearerToken`) — same pattern as MCP bridge |
| SPA | React + Vite, served as static files by WebService itself |
| Scope (phase 1) | Operator-only: sessions, agent runs, cron, channels, tool results, errors, config |

### Plugin Architecture

| Decision | Verdict |
|---|---|
| Plugin format | Directory convention, no external package/SDK needed |
| Tool plugins | `~/.vargos/plugins/tools/<name>.ts` — exports `VargosExtension`, loaded dynamically at boot |
| Channel plugins | `~/.vargos/plugins/channels/<name>.ts` — exports factory fn returning `ChannelAdapter` |
| Loading mechanism | Dynamic `import()` during boot scan, after built-ins register |
| Guest agent | Not a new plugin type — composed from skills + guest registry + TwilioAdapter + config |

---

## Config Schema Additions

```jsonc
{
  "voice": {
    "baseUrl": "http://localhost:8090",   // LocalAI
    "sttModel": "whisper-1",
    "ttsModel": "tts-1",
    "ttsVoice": "alloy",
    "maxConcurrentCalls": 3
  },
  "web": {
    "bearerToken": "...",
    "port": 9003,
    "host": "127.0.0.1"
  },
  "channels": {
    "twilio": {
      "enabled": true,
      "voiceReplyMode": "always",
      "accountSid": "...",
      "authToken": "...",
      "phoneNumber": "+1..."
    },
    "whatsapp": {
      "voiceReplyMode": "mirror"   // new field
    }
  }
}
```

---

## New Files to Create

```
src/lib/voice.ts                          STT + TTS utility (transcribe, synthesize)
src/voice/session.ts                      VoiceSession: Twilio WS ↔ STT ↔ LLM ↔ TTS loop
src/voice/manager.ts                      VoiceCallManager: tracks active calls, inbound/outbound
src/channels/audio.ts                     Shared audio buffer handler (extracted from WA + TG)
src/channels/twilio/adapter.ts            TwilioAdapter: inbound calls, TwiML webhook server
src/tools/agent/phone-call.ts             phone_call tool: initiates outbound, awaits transcript
src/lib/guests.ts                         Guest registry scanner (pattern: src/lib/agents.ts)
src/web/service.ts                        WebService: HTTP+SSE server, gateway bridge
src/web/routes.ts                         REST API route handlers
src/web/sse.ts                            SSE event fan-out to browser clients
```

---

## Phase 0 — Foundation (prerequisite for everything)

**Do this first. Unblocks all other phases.**

- [ ] Extract shared audio handler from WA + TG → `src/channels/audio.ts`
- [ ] Widen `ChannelAdapter.type` from literal union to `string` (`src/channels/types.ts` line 6)
- [ ] Discriminated union for `ChannelConfig` / `ChannelEntry` (per-channel fields, not a bag)
- [ ] Type `InboundMetadata` interface — replace `Record<string, unknown>` in `OnInboundMessageFn`; fix cast sites in `service.ts`
- [ ] **Fix `parseChannelSession` bug**: currently returns `null` for session keys with `:` in the userId portion (`src/channels/service.ts` line 251) — breaks `twilio:<phone>:<callSid>`
- [ ] Dynamic plugin scanning: load `~/.vargos/plugins/tools/` and `~/.vargos/plugins/channels/` at boot

---

## Phase 1 — Voice Foundation (~1–2 weeks, after Phase 0)

- [ ] `src/lib/voice.ts`: `transcribe(filePath, config)` → LocalAI `/v1/audio/transcriptions`
- [ ] `src/lib/voice.ts`: `synthesize(text, config)` → LocalAI `/v1/audio/speech`
- [ ] `src/channels/audio.ts`: `handleAudioMessage(buffer, mimeType, sessionKey, userId, caption)`
- [ ] Wire STT into WhatsApp `handleMedia()` for audio type
- [ ] Wire STT into Telegram audio/voice handling
- [ ] Config: `config.voice` section + validation warning if voiceReplyMode set without baseUrl
- [ ] `VoiceReplyMode` config + TTS reply hook in channel send path
- [ ] `VoiceChannelAdapter extends ChannelAdapter` interface
- [ ] `src/voice/session.ts` + `src/voice/manager.ts`
- [ ] `src/channels/twilio/adapter.ts` (inbound calls first)
- [ ] Twilio webhook: extend `WebhookService` or add dedicated HTTP handler

## Phase 2 — Web Service (~1–2 weeks, parallel with Phase 1)

- [ ] `src/web/service.ts`: ServiceClient, runs HTTP server on port 9003
- [ ] REST endpoints: sessions, agent, tools, cron, channels, gateway stats
- [ ] SSE endpoint: subscribe to gateway events, fan out to clients
- [ ] Bearer token auth (timing-safe compare)
- [ ] Config: `config.web` section
- [ ] Static file serving for SPA assets
- [ ] React + Vite SPA skeleton: session list, agent status, cron management

## Phase 3 — Outbound Voice Calls (~1 week, after Phase 1)

- [ ] `src/tools/agent/phone-call.ts`: `phone_call(to, instructions, persona?)` tool
- [ ] Twilio REST API: outbound call initiation
- [ ] `VoiceCallManager`: outbound call flow, blocking await on transcript
- [ ] Return `{ transcript, summary, durationMs }` as tool result
- [ ] Cron integration test: task fires → agent → phone_call → report → notify

## Phase 4 — Guest Voice Agent (~3–5 days, parallel with Phase 3)

- [ ] `src/lib/guests.ts`: scanner + `resolveGuest(callerId)` function
- [ ] Guest profile YAML frontmatter schema
- [ ] Caller ID → guest lookup in `TwilioAdapter` on inbound
- [ ] Session key: `twilio:<phoneNumber>:<callSid>`
- [ ] `bootstrapOverrides` persona injection + guest skills
- [ ] Example: `~/.vargos/workspace/skills/hotel-concierge/SKILL.md`
- [ ] Example: `~/.vargos/workspace/guests/sample-guest.md`

---

## Dependency Graph

```
Phase 0 (Foundation)
  |
  ├── Phase 1 (Voice)          Phase 2 (Web UI)  ← parallel
  |       |
  |       ├── Phase 3 (Outbound Calls)
  |       └── Phase 4 (Guest Agent)           ← parallel with Phase 3
```

---

## Open Decisions (require product input before implementation)

| # | Question | Stakes |
|---|---|---|
| D1 | Voice model for real-time calls — Claude is likely too slow (latency budget ~400ms for LLM). Need a fast local model via Ollama. | Determines voice conversation quality |
| D2 | `phone_call` max call duration — determines tool timeout and whether to use sync (block) or async (subagent_announce) pattern | Cron scheduling + session queue impact |
| D3 | Guest registry source — file-based manual vs. PMS API webhook sync | Hotel production viability |
| D4 | Web UI scope — operator-only (bearer token, simple) vs. end-user chat (OAuth, complex) | Auth architecture |
| D5 | Call recording — Twilio recording + transcript vs. transcript only | Legal (two-party consent laws) |
| D6 | Plugin distribution — manual file copy vs. `vargos install <plugin>` CLI command | DX for hotel-concierge deployments |

---

## Web API Surface (REST + SSE)

Most gateway methods already exist. No new RPC needed for most web endpoints.

| Web endpoint | Gateway method | New? |
|---|---|---|
| `GET /api/sessions` | `session.list` | No |
| `GET /api/sessions/:key/messages` | `session.getMessages` | No |
| `GET /api/agent/status` | `agent.status` | No |
| `POST /api/agent/run` | `agent.run` | No |
| `GET /api/tools` | `tool.list` | No |
| `GET /api/cron` | `cron.list` | No |
| `POST /api/cron`, `DELETE /api/cron/:id` | `cron.add`, `cron.remove` | No |
| `GET /api/channels` | `channel.list` | No |
| `GET /api/events` (SSE) | gateway subscriptions | New (SSE layer) |
| `GET /api/config` | `config.get` | New method |
| `PATCH /api/config` | `config.update` | New method |
| `GET /api/sessions/:key/tool-results` | filesystem read | New (direct) |
| `GET /api/workspace/tree` | filesystem read | New (direct) |
| `GET /api/errors` | filesystem read | New (direct) |

---

## Risk Register

| Risk | Mitigation |
|---|---|
| Voice latency: STT+TTS each >300ms → total exceeds 1s budget | Benchmark LocalAI latency in Phase 1 before committing; have a fallback fast model |
| Twilio WS drops mid-call | `VoiceSession` must handle reconnection or graceful termination gracefully |
| `phone_call` blocks session queue for long calls | Cap call duration; if > 5 min regularly, switch to async subagent_announce model |
| Web UI XSS exposes bearer token in localStorage | LAN-only deployment; add CSP headers; document internet-exposure hardening steps |
| Concurrent STT/TTS on GPU during high call volume | `maxConcurrentCalls` config; queue excess calls rather than reject |
