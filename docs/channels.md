# Channels

Vargos routes messages from WhatsApp and Telegram to the agent runtime. Each channel runs as an adapter inside the gateway process.

## WhatsApp

Uses the Baileys library (linked devices protocol). Your phone stays the primary device — Vargos connects as a linked device.

**Prerequisites:** A WhatsApp account on your phone.

**Setup:**

```bash
vargos config channel            # Select WhatsApp
```

1. A QR code appears in your terminal
2. Open WhatsApp on your phone > Settings > Linked Devices > Link a Device
3. Scan the QR code
4. Optionally enter allowed phone numbers (whitelist)

Auth state is saved to `~/.vargos/channels/whatsapp/` and persists across restarts.

**Re-link (new QR code):**

```bash
rm -rf ~/.vargos/channels/whatsapp/
vargos gateway restart
```

## Telegram

Uses the official Bot API with long-polling. No webhook setup required.

**Prerequisites:** A Telegram account to create a bot.

**Setup:**

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, follow the prompts, copy the bot token
3. Run the setup:

```bash
vargos config channel            # Select Telegram, paste token
```

**Finding your chat ID:**

Message your bot, then:

```bash
curl https://api.telegram.org/bot<TOKEN>/getUpdates | jq '.result[0].message.chat.id'
```

For full channel config reference, see [configuration.md](./configuration.md#channels).

## Message Flow

```
Incoming message (WhatsApp/Telegram)
    |
    v
Sender filter (allowFrom whitelist)
    |
    v
Dedup (skip if seen in last 120s)
    |
    v
Debounce (batch rapid messages, 2s default)
    |
    v
Gateway > Agent runtime > Tools
    |
    v
Reply sent back through the channel
```

Both channels support text and media (images, audio, video, documents). Only private/direct messages are processed — group messages are ignored.

## Chat Directives

Users can prefix messages with directives to override per-message inference settings:

| Directive | Effect |
|-----------|--------|
| `/think:off` | Disable extended thinking |
| `/think:low` | Low thinking budget |
| `/think:medium` | Medium thinking budget |
| `/think:high` | High thinking budget |
| `/verbose` | Enable verbose tool narration |

Directives are parsed and stripped before reaching the agent — the agent never sees the raw directive tokens.

## Status Reactions

When a message triggers an agent run, emoji reactions track progress on the triggering message:

| Phase | Emoji |
|-------|-------|
| Queued | 👀 |
| Thinking | 🤔 |
| Tool use | 🔧 |
| Done | 👍 |
| Error | ❗ |

Transient phases (thinking, tool) are debounced (500ms). Terminal phases (done, error) are immediate.

## Link Expansion

URLs in inbound messages are auto-fetched and appended as readable text so the agent can understand linked content without using tools.

```jsonc
{
  "linkExpand": {
    "enabled": true,          // default: true
    "maxUrls": 3,             // max URLs to expand per message
    "maxCharsPerUrl": 8000,   // truncate expanded content
    "timeoutMs": 5000         // per-URL fetch timeout
  }
}
```

Private/internal IPs are filtered out. Expansion failures are silently ignored.

## Comparison

| | WhatsApp | Telegram |
|---|---|---|
| Auth | QR code (linked device) | Bot token from @BotFather |
| Protocol | Baileys (WebSocket) | Bot API (HTTP polling) |
| Storage | Auth state on disk (~10MB) | Stateless |
| Dependency | `@whiskeysockets/baileys` | None (raw fetch) |
| Reconnect | Automatic with backoff | Automatic retry after 5s |

## Common Issues

**WhatsApp QR won't scan:**

1. Ensure your phone has internet access
2. Try relinking: `rm -rf ~/.vargos/channels/whatsapp/ && vargos gateway restart`
3. Scan the QR code within 30 seconds

**WhatsApp disconnects after linking:**

Auth state may be corrupted. Delete and re-link:

```bash
rm -rf ~/.vargos/channels/whatsapp/
vargos gateway restart
```

The adapter reconnects automatically with exponential backoff, except for `logged_out` or `forbidden` states.

**Telegram bot not responding:**

1. Verify bot token: `curl https://api.telegram.org/bot<TOKEN>/getMe`
2. Check `allowFrom` — if set, only listed chat IDs receive responses
3. Ensure the bot hasn't been blocked or deactivated
