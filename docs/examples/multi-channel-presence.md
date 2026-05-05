# Example: Multi-Channel Presence

A single Vargos process serves WhatsApp, Telegram, cron, and CLI simultaneously. Each channel maintains its own session keyed by `<channelId>:<chatId>`, isolated from the others. The same agent runtime, tools, memory, and workspace serve all channels.

## How it works

Inbound flow per channel:

```
adapter (telegram/whatsapp)
  → normalizer
  → pipeline (whitelist, link-expand)
  → agent.execute (or agent.appendMessage if skipAgent)
  → reply via channel.send (back through originating channel)
```

Session keys: `telegram-personal:7789...`, `whatsapp-personal:614...`. Cron and `pnpm cli` use their own key formats — see [Sessions](../usage/sessions.md).

Each channel can have its own [persona file](../usage/personas.md) at `~/.vargos/agents/<channelId>.md` to scope tool access and tweak the system prompt. Cron and webhooks deliver via `channel.send` with `fromSessionKey` so the receiver records source attribution in its history.

## Channel surface

| Channel | Status | Features |
|---|---|---|
| Telegram | ✅ | Long-polling, group chat (mention-only), voice, image, document extraction (PDF/DOCX/XLSX/TXT/MD), reactions, typing |
| WhatsApp | ✅ | Baileys linked-devices, voice, image, reactions, typing |
| Pi CLI (`pnpm cli`) | ✅ | Interactive REPL bound to `~/.vargos/agent` and `sessions/cli/` |
| Slack | 📋 | Planned |

## Setup

Configure both channels in `~/.vargos/config.json` `channels[]`. Each entry needs `type`, `id`, optional `allowFrom`. Telegram also needs `botToken`. Schema: [`services/config/schemas/channels.ts`](../../services/config/schemas/channels.ts).

Setup walkthroughs: [Channels](../usage/channels.md).

## See also

- [Channels](../usage/channels.md) — adapter setup
- [Personas](../usage/personas.md) — per-channel behavior overrides
- [Sessions](../usage/sessions.md) — sessionKey formats
