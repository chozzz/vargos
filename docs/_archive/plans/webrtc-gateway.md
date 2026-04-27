# Plan: WebRTC as the Core Session Layer

> **Status: Deferred** — not in active roadmap. Current priority is shipping Phase 0–2 (voice, web UI) over simpler transports. This doc exists so the architecture stays WebRTC-portable.
>
> **Superseded by v2 architecture** — The v2 rewrite in `v2/PLAN.md` implements pure choreography event-driven design. WebRTC may be revisited post-v2 once the v2 fundamentals are stable.

## Vision

WebRTC becomes the primary way everything with identity communicates with Vargos — browsers, agents, MCP clients, voice/video callers, Slack bots, external machines, tools. Every **session** is a WebRTC peer connection. Every **channel** is a peer. Every **agent-to-agent** delegation can be a peer pair.

The internal service coordination bus (ToolsService ↔ AgentService ↔ SessionsService) stays WebSocket on loopback — that's pure infrastructure plumbing with zero latency requirements, zero reason to change. As Vargos scales to multi-machine deployments, even that migrates naturally to WebRTC.

---

## Two-Layer Model

```
┌─────────────────────────────────────────────────────┐
│  Session / Peer Layer  (WebRTC)                     │
│                                                     │
│  browser  agent  MCP client  voice  Slack  CLI app  │
│     └──────────────┬──────────────────────┘         │
│                    │  DataChannel + MediaTracks      │
│          ┌─────────▼──────────┐                     │
│          │  WebRTCService     │  signaling, peers,  │
│          │  (port 9004)       │  media router       │
│          └─────────┬──────────┘                     │
└────────────────────│────────────────────────────────┘
                     │ WebSocket (loopback only)
┌────────────────────│────────────────────────────────┐
│  Service Mesh  (WebSocket gateway, port 9000)       │
│                                                     │
│  AgentService  ToolsService  SessionsService        │
│  ChannelService  CronService  McpBridge             │
└─────────────────────────────────────────────────────┘
```

The WebRTC layer is the public face. The WebSocket layer is private infrastructure. Over time, as services run on separate machines, the WebSocket layer also migrates to WebRTC peer connections — but that's a later evolution, not a prerequisite.

---

## What "Peer" Means

Every entity that holds a session or interacts with the agent is a WebRTC peer:

| Peer | DataChannel use | MediaTrack use |
|------|----------------|----------------|
| Browser UI | RPC calls + event stream | Voice/video calls |
| CLI app (remote) | Same as browser | None |
| MCP client | Tool calls via MCP-over-DataChannel | None |
| Agent (remote machine) | `sessions_spawn` cross-machine delegation | None |
| Twilio / phone | Remain as VoiceChannelAdapter (WebRTC optional) | SIP/RTP bridge |
| Slack | ChannelAdapter via Slack Events API (HTTP) — DataChannel optional | None |
| Discord / other | ChannelAdapter via their API — DataChannel optional | None |

External services (Slack, Discord, GitHub webhooks) connect via their own APIs. Their **Vargos adapter** is the peer — the adapter itself connects to the WebRTC layer and routes messages as sessions. From Vargos's perspective, a Slack user session and a browser user session are both just WebRTC peers with DataChannels.

---

## DataChannel Protocol

Each peer's DataChannel carries the same `RequestFrame` / `ResponseFrame` / `EventFrame` wire protocol used on the internal WebSocket bus. `WebRTCService` bridges transparently:

```
peer DataChannel → RequestFrame → gateway.call(target, method, params) → ResponseFrame → peer
gateway EventFrame → subscribed peers via DataChannel
```

No new protocol design needed. Any existing gateway RPC is reachable from any peer.

---

## Agent-to-Agent via WebRTC

When an agent on a remote machine needs to delegate to a Vargos session, it opens a WebRTC peer connection, sends a `sessions_spawn` RPC over the DataChannel, and receives `subagent_announce` events back. This enables:

- Distributed agent meshes across machines
- External agents (not running inside Vargos) delegating tasks to Vargos tools
- Cross-instance orchestration (two Vargos instances cooperating)

---

## Media Routing

Audio/video MediaTracks on a peer connection are routed based on session context:

- **Voice call peer** → MediaTrack piped to `VoiceSession` (STT → LLM → TTS → MediaTrack back)
- **Screen share** → MediaTrack piped to vision model input (future)
- **TTS output** → `VoiceSession` returns audio as MediaTrack (browser plays natively, no file download)

---

## Signaling

WebRTC requires a signaling channel to exchange SDP offers and ICE candidates before the DataChannel opens. `WebRTCService` exposes a lightweight HTTP signaling endpoint:

```
POST /rtc/offer   → returns answer SDP + session token
POST /rtc/ice     → ICE candidate exchange
```

Auth: bearer token in the signaling request. Once authenticated, the peer connection is established and the token is not needed again.

**LAN deployments:** no STUN/TURN needed. Loopback and LAN peers connect directly.
**Remote deployments:** add `stun.l.google.com:19302` + optional self-hosted `coturn` relay.

---

## Relation to Existing Services

### ChannelService

`ChannelService` currently manages WhatsApp and Telegram adapters. WebRTC becomes a new channel type. Browser sessions, CLI app sessions, and remote agent sessions are all "channel" peers — they produce `message.received` events just like WhatsApp does.

### MCP Bridge

`src/mcp/server.ts` gains a DataChannel transport alongside HTTP and stdio. Remote MCP clients connect via WebRTC for lower latency and no fixed port exposure.

### VoiceSession

`VoiceSession` currently assumes Twilio WebSocket as audio source. Refactor to accept a stream source interface: `TwilioStreamSource | WebRTCTrackSource`. No other changes.

---

## New Files

```
src/webrtc/service.ts          WebRTCService: ServiceClient, signaling, peer registry
src/webrtc/signaling.ts        HTTP signaling endpoint (SDP/ICE)
src/webrtc/peer.ts             Peer: DataChannel bridge + MediaTrack router
src/webrtc/subscriptions.ts    Event fan-out to subscribed peers
src/webrtc/stream-source.ts    WebRTCTrackSource implementing VoiceSession stream interface
```

---

## Phases

### Phase A — DataChannel bridge (prerequisite: Phase 0)

- [ ] `WebRTCService` with HTTP signaling endpoint
- [ ] `Peer`: DataChannel ↔ gateway RPC passthrough
- [ ] Event subscription + fan-out to peers
- [ ] Bearer token auth at signaling
- [ ] Browser JS client (thin wrapper over native WebRTC APIs)

### Phase B — Web UI over WebRTC (replaces Phase 2 in voice-web-plugins.md)

- [ ] React SPA connects via DataChannel
- [ ] All operator features: sessions, agent, cron, tools, errors, config

### Phase C — Voice/Video

- [ ] `WebRTCTrackSource` implements `VoiceSession` stream interface
- [ ] Browser audio → STT → LLM → TTS → audio track back
- [ ] Video track → vision model input (optional)

### Phase D — Channel adapters and external agents

- [ ] Slack `ChannelAdapter` (Slack Events API → ChannelService peer)
- [ ] Discord adapter (same pattern)
- [ ] Remote MCP client over DataChannel
- [ ] Cross-machine `sessions_spawn` via WebRTC peer

---

## Impact on Existing Code

| Component | Change | Risk |
|-----------|--------|------|
| Internal WS gateway bus | None | Zero |
| `ServiceClient` base class | None | Zero |
| `src/channels/types.ts` | `ChannelType` widened to `string` (Phase 0, already planned) | Zero |
| `src/mcp/server.ts` | Add DataChannel transport (additive) | Low |
| `src/voice/session.ts` | Stream source interface (Twilio WS or WebRTC track) | Low |
| Everything else | No changes | Zero |

---

## Open Decisions

| # | Question | Stakes |
|---|----------|--------|
| R1 | TURN relay — self-hosted `coturn` vs. cloud | Required for internet-exposed deployments |
| R2 | Node.js WebRTC library — `@roamhq/wrtc` vs. wait for Node built-in | `@roamhq/wrtc` has native bindings; Node built-in WebRTC landing in v22+ |
| R3 | Multi-machine service bus — when to migrate internal WS to WebRTC | Triggered by first multi-machine deployment need |
| R4 | DataChannel multiplexing — one channel per concern vs. single muxed | Flexibility vs. simplicity |
| R5 | Slack adapter scope — read-only notify vs. full bidirectional | Determines bot permissions needed |
