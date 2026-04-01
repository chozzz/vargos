# Example: Multi-Channel Presence

A single agent instance reachable across WhatsApp, Telegram, and CLI simultaneously. Each channel maintains its own session and conversation history.

## How It Works

Each channel runs as an adapter inside the gateway process:

```
Inbound message (WhatsApp/Telegram)
    ↓
message.received event
    ↓
AgentService queues per session
    ↓
Agent executes with tools
    ↓
Response sent back through originating channel
```

Session keys are channel-scoped:
- `whatsapp-personal:61423222658`
- `telegram-bakabit:123456`
- `cli:chat`

Conversations are isolated, but the same agent runtime, tools, memory, and workspace serve all channels.

## Supported Channels

| Channel | Status | Features |
|---------|--------|----------|
| WhatsApp | ✅ Live | Multi-device, voice notes, media, reactions, typing indicators |
| Telegram | ✅ Live | Bot API, voice/audio, media, reactions |
| CLI | ✅ Live | Interactive chat and one-shot `run` mode |

## Configuration

```jsonc
{
  "channels": {
    "instances": [
      {
        "id": "whatsapp-personal",
        "type": "whatsapp",
        "allowFrom": ["61423222658"]
      },
      {
        "id": "telegram-bakabit",
        "type": "telegram",
        "allowFrom": ["123456789"]
      }
    ]
  }
}
```

## Features

- **Message debouncing**: 2s batch window for rapid messages
- **Status reactions**: Emoji reactions track agent progress (👀 → 🤔 → 🔧 → ✅)
- **Typing indicators**: Shown while agent is thinking
- **Media support**: Images, audio, video, documents
- **Chat directives**: `/think:off`, `/verbose` to override inference settings

See [channels.md](../channels.md) for setup instructions.
