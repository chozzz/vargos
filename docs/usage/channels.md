# Channels

Vargos routes messages from WhatsApp and Telegram to the agent runtime. Each channel runs as an adapter inside the gateway process. Configure channels under `channels[]` in `~/.vargos/config.json` — schema in [`services/config/schemas/channels.ts`](../../services/config/schemas/channels.ts).

## Telegram

Uses the Bot API directly (no SDK), long-polling, IPv4-forced. Adapter: [`services/channels/providers/telegram/`](../../services/channels/providers/telegram/).

**Setup**:
1. Talk to [@BotFather](https://t.me/BotFather), create a bot, copy the token.
2. Add a channel entry to `config.json` with `type: "telegram"`, `id`, `botToken`, `enabled`, optional `allowFrom` (Telegram numeric user IDs — find your own via `@userinfobot`).
3. `pnpm start` — Vargos verifies via `getMe` and starts long-polling.

## WhatsApp

Uses Baileys (linked-devices protocol). Your phone stays primary; Vargos is a linked device. Adapter: [`services/channels/providers/whatsapp/`](../../services/channels/providers/whatsapp/).

**Setup**:
1. Add a channel entry with `type: "whatsapp"`, `id`, `enabled`, `allowFrom` (phone numbers, no leading `+`; `@lid` JIDs also accepted).
2. `pnpm start` — a QR code appears.
3. Phone → Settings → Linked Devices → Link a Device → scan.

Auth state is saved per-instance at `~/.vargos/channels/<id>/`. Re-link by deleting that dir and restarting.

## Group chats (Telegram)

Group chats are supported with **mention-only listening**. The bot only runs when:
- Message is in a private chat (DM), **or**
- Bot is `@`-mentioned by username, **or**
- Message is a reply to one of the bot's messages

Non-mentioned group messages are appended to history (so the agent has context if mentioned later) but don't trigger a run. Logic: [`services/channels/providers/telegram/normalizer.ts`](../../services/channels/providers/telegram/normalizer.ts).

## Per-channel persona files

Each channel has its own system-prompt overrides at `~/.vargos/agents/<channelId>.md`, auto-seeded at boot. See [Personas](./personas.md).

## Inbound metadata

Channel adapters populate rich metadata on each inbound message: sender identity (`fromUser*`), bot identity (`botName`/`botUserId`/`botHandle`), `chatType`, `isMentioned`, `messageId` (for reactions), `media`. Schema in [`gateway/events.ts`](../../gateway/events.ts) `InboundMessageMetadata`. These flow through into the system prompt as `${USER_NAME}`, `${BOT_NAME}`, etc.

## Documents and media

| Type | Telegram | WhatsApp |
|---|---|---|
| Images | ✅ vision passthrough | ✅ vision passthrough |
| Voice / audio | ✅ Whisper transcription | ✅ Whisper transcription |
| Documents (PDF/DOCX/XLSX/TXT/MD) | ✅ extracted to text | 🟧 deferred |

Configure transcription/vision providers in `agent/settings.json` `media`. Implementation: [`services/media/`](../../services/media/).

## Status reactions

While the agent processes, the bot updates its message reactions: 👀 received → 🤔 thinking → 🔧 tool use → 👍 done / ❗ error. See [`services/channels/status-reactions.ts`](../../services/channels/status-reactions.ts).

## Chat directives

Inline directives the user can prefix to a message:

| Directive | Effect |
|---|---|
| `/think:high` | Force thinking-level (`off`, `low`, `medium`, `high`, `xhigh`) |
| `/verbose` | More detailed responses |

Parser: [`services/agent/directives.ts`](../../services/agent/directives.ts).

## Whitelist enforcement

`allowFrom` is checked **before** the agent runs. Non-whitelisted senders' messages are appended to history but the agent isn't invoked. Always set `allowFrom` for production channels — see [`SECURITY.md`](../../SECURITY.md).

## Cross-channel forwarding

Cron and webhooks deliver to channels via `channel.send` with `fromSessionKey`, which prefixes `[fromSessionKey] text` and injects into target session history. The receiving agent learns the message came from elsewhere via the prefix convention (taught in `~/.vargos/workspace/AGENTS.md`).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| QR code doesn't appear (WhatsApp) | Auth state already loaded — wait for `connected` |
| Telegram bot silent | `allowFrom` rejecting sender, or missing API key (check stdout for `[agent] ERROR`) |
| Group chat ignored | Bot wasn't `@`-mentioned or replied-to |
| `Error: No API key for provider: X` in chat | Add API key in `agent/auth.json` or `${PROVIDER}_API_KEY` env |

More: [Troubleshooting](./troubleshooting.md).

## See also

- [Personas](./personas.md) — per-channel behavior overrides
- [Configuration](../configuration.md) — `ChannelEntry` schema
- [Sessions](./sessions.md) — sessionKey formats
