# Channels Architecture

Channel adapters live under [`services/channels/providers/<name>/`](../../services/channels/providers/). Currently shipped:

- [`telegram/`](../../services/channels/providers/telegram/) — Bot API long-polling, no SDK
- [`whatsapp/`](../../services/channels/providers/whatsapp/) — Baileys (linked-devices)

The channel service ([`services/channels/index.ts`](../../services/channels/index.ts)) discovers providers via [`provider-loader.ts`](../../services/channels/provider-loader.ts), wires them into the inbound pipeline ([`pipeline.ts`](../../services/channels/pipeline.ts)), and registers the bus surface (`channel.send`, `channel.search`, etc.).

## Inbound flow

```
adapter (telegram/whatsapp)
  → normalizer (provider-specific → NormalizedInboundMessage)
  → debouncer (configurable per channel)
  → pipeline.process()
       ├─ link expansion
       ├─ whitelist check (allowFrom)
       ├─ if skipAgent: agent.appendMessage (record only)
       └─ else: agent.execute → reply via channel.send
```

`NormalizedInboundMessage` shape: [`services/channels/contracts.ts`](../../services/channels/contracts.ts).

## Outbound flow

```
channel.send(sessionKey, text, fromSessionKey?)
  → strip markdown
  → adapter.send (chunked via delivery.ts)
  → if fromSessionKey: agent.appendMessage to inject [fromSessionKey] text into target history
```

## Provider contract

Every adapter implements `ChannelAdapter` from [`contracts.ts`](../../services/channels/contracts.ts) and extends [`BaseChannelAdapter`](../../services/channels/base-adapter.ts) for shared behavior:
- Typing-indicator state machine ([`typing-state.ts`](../../services/channels/typing-state.ts))
- Status reactions ([`status-reactions.ts`](../../services/channels/status-reactions.ts))
- Inbound media handling
- Reconnection with backoff ([`reconnect.ts`](../../services/channels/reconnect.ts))
- Message dedup ([`dedupe.ts`](../../services/channels/dedupe.ts)) and debounce ([`debounce.ts`](../../services/channels/debounce.ts))

A `ChannelProvider` is the factory: it creates adapters from a `ChannelEntry` config. Providers register at boot via the loader.

## File map

```
services/channels/
├── index.ts                  ChannelService — registers bus methods, wires providers
├── pipeline.ts               InboundMessagePipeline — whitelist, link-expand, dispatch
├── contracts.ts              ChannelAdapter, NormalizedInboundMessage, ChannelProvider
├── base-adapter.ts           BaseChannelAdapter (shared adapter behavior)
├── delivery.ts               Outbound chunking and per-chunk dispatch
├── debounce.ts               Per-session inbound message debouncer
├── dedupe.ts                 Inbound message ID dedup
├── link-expand.ts            URL auto-expansion (web.fetch → markdown)
├── media-extract.ts          Outbound text → media file path extraction
├── status-reactions.ts       Reaction state machine
├── typing-state.ts           Typing-indicator circuit breaker
├── reconnect.ts              Exponential-backoff reconnector
├── provider-loader.ts        Discover and register providers at boot
├── types.ts                  Cross-cutting types
└── providers/
    ├── telegram/             adapter, normalizer, types, index
    └── whatsapp/             adapter, normalizer, session, types, index
```

## Per-channel customization

Channel configuration carries `model?`, `cwd?`, `debounceMs?`, `allowFrom?`. Per-channel **system prompt + tool whitelist** lives in [persona files](../usage/personas.md) at `~/.vargos/agents/<channelId>.md`, applied by [`services/agent/persona.ts`](../../services/agent/persona.ts).

## See also

- [Channels usage](../usage/channels.md) — setting up Telegram and WhatsApp
- [Personas](../usage/personas.md) — per-channel behavior overrides
- [Bus Design](./bus-design.md) — how channel adapters integrate with the bus
