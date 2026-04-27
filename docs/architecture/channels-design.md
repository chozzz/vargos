# Channels Architecture Design

This document describes the channel provider architecture for Vargos—how platforms (WhatsApp, Telegram, etc.) integrate with the agent runtime.

## Architecture Overview

The channel system is built on three core abstractions:

1. **ChannelProvider** — Factory for creating adapters (validates config, instantiates)
2. **ChannelAdapter** — Platform-specific implementation (send, receive, normalize)
3. **ChannelPipeline** — Policy enforcement (whitelist, link expansion, agent execution)

This separation ensures:
- ✅ New providers (Slack, Discord) don't modify core code
- ✅ Policy decisions are centralized (not scattered across adapters)
- ✅ Message normalization is consistent across all platforms
- ✅ Capabilities are explicit, not guessed

---

## Core Contracts

### ChannelAdapter Interface

```typescript
interface ChannelAdapter {
  readonly type: string;
  readonly instanceId: string;
  status: ChannelStatus;

  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;

  // Outbound
  sendText(target: ChannelTarget, text: string): Promise<void>;
  sendTyping(target: ChannelTarget, state: 'typing' | 'paused' | 'stopped'): Promise<void>;

  // Inbound
  normalizeInbound(raw: unknown): Promise<NormalizedInboundMessage | null>;

  // Session mapping
  buildTargetFromSessionKey(sessionKey: string): ChannelTarget;
  buildSessionKey(target: ChannelTarget): string;

  // Capabilities discovery
  getCapabilities(): ChannelCapabilities;
}
```

### ChannelProvider Interface

```typescript
interface ChannelProvider<TConfig = unknown> {
  readonly type: string;
  validateConfig(config: unknown): TConfig;
  createAdapter(config: TConfig, context: ChannelProviderContext): Promise<ChannelAdapter>;
}
```

### NormalizedInboundMessage

All incoming messages are normalized to this shape:

```typescript
interface NormalizedInboundMessage {
  id: string;
  target: ChannelTarget;
  text?: string;
  sender: { id: string; displayName?: string; username?: string };
  chatType: 'private' | 'group' | 'channel' | 'thread';
  fromSelf: boolean;
  isMentioned: boolean;
  shouldAct: boolean;
  timestamp: number;
  media?: InboundMedia[];
  raw?: unknown;
}
```

### ChannelTarget

Identifies where to send replies and how to route messages:

```typescript
interface ChannelTarget {
  channelId: string;        // adapter instance id
  conversationId: string;   // where replies go
  senderId?: string;        // actual sender in group/thread
  threadId?: string;        // for nested conversations
}
```

### ChannelCapabilities

Each adapter declares what it supports:

```typescript
interface ChannelCapabilities {
  text: boolean;
  sendMedia: boolean;
  receiveMedia: boolean;
  reactions: boolean;
  typing: boolean;
  groups: boolean;
  threads: boolean;
}
```

---

## Design Decisions

| Aspect | Why This Way |
|--------|--------------|
| **Provider as Factory** | Validates config once, creates adapter. Enables config validation errors at boot, not at message processing. |
| **NormalizedInboundMessage** | Single inbound shape prevents inconsistency across platforms. Pipeline receives consistent contracts. |
| **ChannelTarget as Structured Object** | Supports threads and nested conversations. Flat strings (`channel:id`) don't extend well. |
| **Capabilities Explicit** | Prevents `adapter.sendMedia?.()` optional chaining. Capabilities are discovered upfront. |
| **Pipeline Owns Policy** | Whitelist, skipAgent, link expansion, typing strategy all in one place. ChannelService stays pure orchestrator. |
| **Normalizer Pattern** | Each platform owns its normalization logic (JID resolution, mention detection, media handling). |
| **Registry Pattern** | New providers register themselves. ChannelService doesn't know which providers exist. |

---

## Separation of Concerns

| Component | Owns | Does NOT Own |
|-----------|------|---|
| **ChannelService** | Adapter lifecycle, session tracking, reply sending, bus integration | Policy logic, platform details |
| **ChannelPipeline** | Whitelist check, skipAgent, link expansion, typing, agent.execute call | Message normalization, platform specifics |
| **ChannelRegistry** | Type → provider mapping | Adapter creation details |
| **BaseChannelAdapter** | Typing state, debounce, deduplication, session key parsing | Platform protocol, normalization |
| **Provider** | Config validation, adapter factory | Everything (lives in adapter) |
| **Adapter** | Connect, send, receive, normalize, capabilities | Policy decisions |
| **Normalizer** | Translate raw event to NormalizedInboundMessage | Policy (shouldAct set by pipeline) |

---

## Adding a New Provider

The pattern scales. Here's how to add Slack:

```typescript
// services/channels/providers/slack/index.ts
export const SlackProvider: ChannelProvider<SlackConfig> = {
  type: 'slack',
  validateConfig(config: unknown): SlackConfig {
    return SlackConfigSchema.parse(config);
  },
  async createAdapter(config, context): Promise<ChannelAdapter> {
    return new SlackAdapter(config.id, config.botToken, config.signingSecret, context);
  },
};

// services/channels/providers/slack/adapter.ts
export class SlackAdapter extends BaseChannelAdapter {
  readonly type = 'slack';

  async normalizeInbound(raw: SlackEvent): Promise<NormalizedInboundMessage | null> {
    return SlackNormalizer.normalize(raw, this.botUserId);
  }

  async sendText(target: ChannelTarget, text: string): Promise<void> {
    // Slack-specific API call
  }

  getCapabilities(): ChannelCapabilities {
    return {
      text: true,
      sendMedia: true,
      receiveMedia: true,
      reactions: true,
      typing: true,
      groups: true,
      threads: true,  // Slack supports threads natively
    };
  }
}

// services/channels/providers/slack/normalizer.ts
export class SlackNormalizer {
  static normalize(event: SlackEvent, botUserId: string): NormalizedInboundMessage | null {
    // Slack-specific normalization (thread detection, mention handling, etc.)
  }
}
```

Adding Slack requires:
- 4 new files in `services/channels/providers/slack/`
- Register in ChannelRegistry on boot
- **No changes to ChannelService, ChannelPipeline, or contracts**

---

## File Structure

```
services/channels/
├── index.ts                    # ChannelService orchestrator
├── contracts.ts                # All interfaces & types
├── registry.ts                 # ChannelRegistry
├── pipeline.ts                 # Inbound policy
├── outbound.ts                 # Send/media orchestration
├── base-adapter.ts             # BaseChannelAdapter
├── media.ts                    # Media processing
│
├── providers/
│   ├── telegram/
│   │   ├── index.ts            # TelegramProvider
│   │   ├── adapter.ts          # TelegramAdapter
│   │   ├── normalizer.ts       # TelegramNormalizer
│   │   └── types.ts
│   │
│   ├── whatsapp/
│   │   ├── index.ts            # WhatsAppProvider
│   │   ├── adapter.ts          # WhatsAppAdapter
│   │   ├── normalizer.ts       # WhatsAppNormalizer
│   │   ├── client.ts           # Baileys integration
│   │   └── types.ts
│   │
│   └── slack/                  # Future provider
│       ├── index.ts
│       ├── adapter.ts
│       ├── normalizer.ts
│       └── types.ts
│
└── __tests__/
    ├── contract/               # Adapter contract tests
    ├── pipeline/               # Policy tests
    ├── providers/              # Provider-specific tests
    └── e2e/                    # End-to-end integration
```

---

## Why This Design is Production-Ready

✅ **Extensible** — Add Slack, Discord, Signal without touching core  
✅ **Consistent** — All adapters implement the same contract  
✅ **Clear Boundaries** — No overlap, no ambiguity in responsibility  
✅ **Policy Centralized** — Whitelist, typing, agent execution in one place  
✅ **Testable** — Pipeline and adapters tested independently  
✅ **Future-Proof** — ChannelTarget supports threads, nested conversations  
✅ **Discoverable** — Capabilities object instead of optional methods  

---

## See Also

- [Getting Started](../getting-started.md) — Channel setup
- [Configuration](../configuration.md) — Channel config reference
- [Channels Usage Guide](../usage/channels.md) — User-facing guide
