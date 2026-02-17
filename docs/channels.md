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

**Config:**

```jsonc
{
  "channels": {
    "whatsapp": {
      "enabled": true,
      "allowFrom": ["+1234567890"]  // optional, empty = accept all
    }
  }
}
```

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

**Config:**

```jsonc
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "123456789:ABCdef...",
      "allowFrom": ["987654321"]   // optional, chat IDs (not usernames)
    }
  }
}
```

**Finding your chat ID:**

Message your bot, then:

```bash
curl https://api.telegram.org/bot<TOKEN>/getUpdates | jq '.result[0].message.chat.id'
```

## Both Channels

```jsonc
{
  "channels": {
    "whatsapp": {
      "enabled": true,
      "allowFrom": ["+1234567890"]
    },
    "telegram": {
      "enabled": true,
      "botToken": "123456789:ABCdef...",
      "allowFrom": ["987654321"]
    }
  }
}
```

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
Debounce (batch rapid messages, 1.5s)
    |
    v
Gateway > Agent runtime > Tools
    |
    v
Reply sent back through the channel
```

Both channels support text and media (images, audio, video, documents). Only private/direct messages are processed — group messages are ignored.

## Comparison

| | WhatsApp | Telegram |
|---|---|---|
| Auth | QR code (linked device) | Bot token from @BotFather |
| Protocol | Baileys (WebSocket) | Bot API (HTTP polling) |
| Storage | Auth state on disk (~10MB) | Stateless |
| Dependency | `@whiskeysockets/baileys` | None (raw fetch) |
| Reconnect | Automatic with backoff | Automatic retry after 5s |

See [configuration.md](./configuration.md) for full config reference.
