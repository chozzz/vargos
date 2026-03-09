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

See [configuration.md](./configuration.md) for full config reference.
