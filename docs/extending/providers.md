# Channel Providers

A channel provider is a factory + adapter pair that connects a messaging platform to Vargos. Existing providers under [`services/channels/providers/`](../../services/channels/providers/):

- [`telegram/`](../../services/channels/providers/telegram/) — Bot API long-polling
- [`whatsapp/`](../../services/channels/providers/whatsapp/) — Baileys (linked-devices)

## Contracts

What an adapter must satisfy:

- `ChannelAdapter` interface — [`services/channels/contracts.ts`](../../services/channels/contracts.ts)
- `ChannelProvider` factory — same file
- `BaseChannelAdapter` — [`services/channels/base-adapter.ts`](../../services/channels/base-adapter.ts) — extend this for shared mechanics (typing state, dedupe, debounce, status reactions, reconnect)
- `NormalizedInboundMessage` — what your adapter must produce after normalization

## What you write

A new provider is typically four files under `providers/<name>/`:

| File | Purpose |
|---|---|
| `adapter.ts` | Concrete `ChannelAdapter` extending `BaseChannelAdapter`. Connects, polls/listens, calls `onInbound(normalized)`, implements `send(sessionKey, text)`. |
| `normalizer.ts` | Provider-specific message → `NormalizedInboundMessage` |
| `types.ts` | Provider-specific raw types |
| `index.ts` | `ChannelProvider` factory |

Read the telegram provider for the leanest example, whatsapp for the most elaborate (Baileys session, LID mapping).

## Wiring it up

1. Add a discriminated-union member to [`services/config/schemas/channels.ts`](../../services/config/schemas/channels.ts) `ChannelEntrySchema` for your provider's config.
2. Register the provider in [`services/channels/provider-loader.ts`](../../services/channels/provider-loader.ts) so it's discovered at boot.
3. Restart — the channel service's boot loop ([`services/channels/index.ts`](../../services/channels/index.ts)) finds your config entries and instantiates the adapter.

## What you get for free from `BaseChannelAdapter`

- Typing-indicator state machine ([`typing-state.ts`](../../services/channels/typing-state.ts))
- Status reactions via [`status-reactions.ts`](../../services/channels/status-reactions.ts) — your adapter implements `react()` if the platform supports it
- Inbound media handling — call `processInboundMedia()` with a media source
- Reconnection with backoff via [`Reconnector`](../../services/channels/reconnect.ts)
- Per-message dedup ([`dedupe.ts`](../../services/channels/dedupe.ts)) and debounce ([`debounce.ts`](../../services/channels/debounce.ts))

## Persona files

Channel personas (`~/.vargos/agents/<channelId>.md`) work for any provider — the agent service reads them based on `parseSessionKey(sessionKey).type` matching a configured channel id. No work needed in the adapter. See [Personas](../usage/personas.md).

## See also

- [Channels usage](../usage/channels.md) — config and behavior
- [Channels architecture](../architecture/channels-design.md) — file map and inbound/outbound flow
- [Bus design](../architecture/bus-design.md) — how `channel.send` and `agent.appendMessage` interact
