# Adding a Channel Provider

Channel providers connect new messaging platforms (Slack, Discord, Signal) to Vargos. This guide explains the provider interface and implementation pattern.

## Provider Interface

Every channel provider must implement:

```typescript
interface ChannelProvider<TConfig = unknown> {
  readonly type: string;
  validateConfig(config: unknown): TConfig;
  createAdapter(config: TConfig, context: ChannelProviderContext): Promise<ChannelAdapter>;
}
```

## Adapter Interface

Each provider creates adapters (platform-specific implementations):

```typescript
interface ChannelAdapter {
  readonly type: string;
  readonly instanceId: string;
  status: ChannelStatus;

  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;

  // Send messages
  sendText(target: ChannelTarget, text: string): Promise<void>;
  sendTyping(target: ChannelTarget, state: 'typing' | 'paused' | 'stopped'): Promise<void>;

  // Receive messages
  normalizeInbound(raw: unknown): Promise<NormalizedInboundMessage | null>;

  // Session mapping
  buildTargetFromSessionKey(sessionKey: string): ChannelTarget;
  buildSessionKey(target: ChannelTarget): string;

  // Platform capabilities
  getCapabilities(): ChannelCapabilities;
}
```

## Implementation Example: Slack

### Step 1: Define Config Schema

```typescript
// services/channels/providers/slack/types.ts
export interface SlackConfig {
  id: string;
  botToken: string;
  signingSecret: string;
  enabled?: boolean;
}

export const SlackConfigSchema = z.object({
  id: z.string(),
  botToken: z.string(),
  signingSecret: z.string(),
  enabled: z.boolean().optional()
});
```

### Step 2: Create Provider Factory

```typescript
// services/channels/providers/slack/index.ts
export const SlackProvider: ChannelProvider<SlackConfig> = {
  type: 'slack',

  validateConfig(config: unknown): SlackConfig {
    return SlackConfigSchema.parse(config);
  },

  async createAdapter(config: SlackConfig, context): Promise<ChannelAdapter> {
    return new SlackAdapter(config.id, config.botToken, config.signingSecret, context);
  }
};
```

### Step 3: Implement Adapter

```typescript
// services/channels/providers/slack/adapter.ts
export class SlackAdapter extends BaseChannelAdapter {
  readonly type = 'slack';
  private client: SlackClient;

  constructor(
    instanceId: string,
    botToken: string,
    signingSecret: string,
    private context: ChannelProviderContext
  ) {
    super();
    this.instanceId = instanceId;
    this.client = new SlackClient(botToken);
  }

  async start(): Promise<void> {
    this.status = 'connecting';
    await this.client.connect();
    this.client.on('message', (event) => this.handleMessage(event));
    this.status = 'connected';
  }

  async stop(): Promise<void> {
    this.status = 'disconnecting';
    await this.client.disconnect();
    this.status = 'disconnected';
  }

  async sendText(target: ChannelTarget, text: string): Promise<void> {
    await this.client.postMessage({
      channel: target.conversationId,
      text: stripMarkdown(text)
    });
  }

  async normalizeInbound(raw: any): Promise<NormalizedInboundMessage | null> {
    return SlackNormalizer.normalize(raw, this.client.botUserId);
  }

  protected async sendTypingIndicator(target: ChannelTarget): Promise<void> {
    // Slack doesn't support typing indicators directly
    // Omit or log as not supported
  }

  getCapabilities(): ChannelCapabilities {
    return {
      text: true,
      sendMedia: true,
      receiveMedia: true,
      reactions: true,
      typing: false,
      groups: true,
      threads: true
    };
  }

  private async handleMessage(event: SlackEvent): Promise<void> {
    const normalized = await this.normalizeInbound(event);
    if (!normalized) return;

    const sessionKey = this.buildSessionKey(normalized.target);
    await this.context.onInboundMessage(sessionKey, normalized.text || '', {
      raw: event
    });
  }
}
```

### Step 4: Normalize Messages

```typescript
// services/channels/providers/slack/normalizer.ts
export class SlackNormalizer {
  static normalize(
    event: SlackEvent,
    botUserId: string
  ): NormalizedInboundMessage | null {
    const msg = event.message;
    if (!msg) return null;
    if (msg.user === botUserId) return null;  // Ignore bot's own messages

    return {
      id: msg.ts,
      target: {
        channelId: 'slack-1',
        conversationId: msg.channel,
        senderId: msg.user,
        threadId: msg.thread_ts
      },
      text: msg.text,
      sender: {
        id: msg.user,
        displayName: msg.username,
        username: msg.username
      },
      chatType: msg.channel.startsWith('D') ? 'private' : 'group',
      fromSelf: false,
      isMentioned: msg.text?.includes(`<@${botUserId}>`) ?? false,
      shouldAct: msg.channel.startsWith('D') || msg.text?.includes(`<@${botUserId}>`) ?? false,
      timestamp: Math.floor(parseFloat(msg.ts) * 1000)
    };
  }
}
```

## Registering the Provider

In the ChannelService boot sequence:

```typescript
const registry = new ChannelRegistry();
registry.register(SlackProvider);
registry.register(TelegramProvider);
registry.register(WhatsAppProvider);
```

Now users can add Slack to their config:

```json
{
  "channels": [
    {
      "type": "slack",
      "id": "slack-work",
      "botToken": "xoxb-...",
      "signingSecret": "...",
      "enabled": true
    }
  ]
}
```

## Testing a Provider

```typescript
import { describe, it, expect } from 'vitest';
import { SlackAdapter } from './adapter';

describe('SlackAdapter', () => {
  it('normalizes inbound messages', async () => {
    const rawEvent = {
      message: {
        ts: '1234567890.123456',
        channel: 'C123456',
        user: 'U123456',
        text: 'Hello bot',
        username: 'john'
      }
    };

    const normalized = SlackNormalizer.normalize(rawEvent, 'BOT_ID');
    
    expect(normalized?.text).toBe('Hello bot');
    expect(normalized?.sender.displayName).toBe('john');
    expect(normalized?.chatType).toBe('group');
  });

  it('sends messages', async () => {
    const mockClient = { postMessage: vi.fn() };
    const adapter = new SlackAdapter('slack-1', 'token', 'secret', mockContext);
    adapter.client = mockClient;

    await adapter.sendText(
      { channelId: 'slack-1', conversationId: 'C123' },
      'Hello'
    );

    expect(mockClient.postMessage).toHaveBeenCalledWith({
      channel: 'C123',
      text: 'Hello'
    });
  });
});
```

## Checklist

Before shipping a new provider:

- [ ] Config schema validates correctly
- [ ] Adapter implements all interface methods
- [ ] Message normalization handles platform quirks
- [ ] Typing state management works (or explicitly not supported)
- [ ] Media handling (if supported) is tested
- [ ] Thread/nested conversation support (if applicable)
- [ ] Reconnection logic handles network failures
- [ ] Tests cover happy path and error cases
- [ ] Documentation includes setup instructions

## See Also

- [Channels Architecture](./architecture/channels-design.md) — Design patterns
- [Configuration](./usage/configuration.md) — Channel config reference
