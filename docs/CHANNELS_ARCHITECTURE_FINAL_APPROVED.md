# Vargos Channels: Final Architecture (Approved)

## Evaluation: Why This Approach is Superior

### ✅ Solves Core Problems My Proposals Missed

| Problem | My Approach | Your Approach | Winner |
|---------|---|---|---|
| **Provider growth** | Switch-case in index.ts, registry inlined | Dedicated providers/ folder, self-contained modules | ✅ Yours (scales to 10+ adapters clearly) |
| **Adapter bloat** | Optional methods (`sendMedia?`, `react?`) | Capabilities object + optional methods | ✅ Yours (explicit, discoverable) |
| **Normalizer drift** | Adapter builds metadata, ChannelService enriches | Separate normalizer.ts per platform | ✅ Yours (prevents inconsistency) |
| **Session key format** | `channel:id` flat string | `ChannelTarget` structured object | ✅ Yours (extensible to threads, nested) |
| **Typing control** | Template methods in base | Method parameter: `'typing' | 'paused' | 'stopped'` | ✅ Yours (explicit states, clearer) |
| **Policy scatter** | Pipeline extracted but still touches index.ts | Dedicated pipeline.ts orchestrates all policy | ✅ Yours (cleaner) |
| **ChannelService obesity** | Reduced to ~280 LOC | Reduced to ~150 LOC (delegates to pipeline + outbound) | ✅ Yours (smaller) |

### ✅ Design Principles You Enforce

1. **Core owns policy** — ChannelService is orchestrator, not executor
2. **Providers own integration** — Each platform self-contained
3. **Normalizers prevent drift** — Consistent inbound shape across platforms
4. **Registry prevents switch-case growth** — Easy to add Slack/Discord
5. **Pipeline prevents ChannelService obesity** — Clear separation of concerns
6. **lib/ owns generic** — Truly reusable utilities elsewhere

---

## Architecture: Your Proposed Structure

### Core Files (7–8 files)

```typescript
// services/channels/index.ts [~150 LOC]
export class ChannelService {
  private registry: ChannelRegistry;
  private adapters: Map<string, ChannelAdapter>;
  private activeSessions: Map<string, ActiveSession>;

  constructor(bus: Bus, config: AppConfig) { … }

  // Bus handlers
  @register('channel.send', …) async send(params): Promise<Result>;
  @register('channel.sendMedia', …) async sendMedia(params): Promise<Result>;
  @register('channel.search', …) async search(params): Promise<Result>;
  @register('channel.get', …) async get(params): Promise<Result>;
  @register('channel.register', …) async register(params): Promise<void>;

  // Event handlers
  @on('agent.onTool') private onAgentTool(payload): void;
  @on('agent.onCompleted') private onAgentCompleted(payload): void | Promise<void>;

  // Delegates to pipeline
  private async onInboundMessage(sessionKey, content, metadata?): Promise<void>;

  // Lifecycle
  private async startAllConfigured(): Promise<void>;
  private async startChannel(entry): Promise<void>;
  async stop(): Promise<void>;
}

export async function boot(bus: Bus): Promise<{ stop(): Promise<void> }>;
```

```typescript
// services/channels/contracts.ts [~100 LOC]
export interface ChannelAdapter {
  readonly type: string;
  readonly instanceId: string;
  status: ChannelStatus;

  start(): Promise<void>;
  stop(): Promise<void>;

  sendText(target: ChannelTarget, text: string): Promise<void>;
  sendTyping(target: ChannelTarget, state: 'typing' | 'paused' | 'stopped'): Promise<void>;

  normalizeInbound(raw: unknown): Promise<NormalizedInboundMessage | null>;

  buildTargetFromSessionKey(sessionKey: string): ChannelTarget;
  buildSessionKey(target: ChannelTarget): string;

  getCapabilities(): ChannelCapabilities;
}

export interface ChannelProvider<TConfig = unknown> {
  readonly type: string;
  validateConfig(config: unknown): TConfig;
  createAdapter(config: TConfig, context: ChannelProviderContext): Promise<ChannelAdapter>;
}

export interface NormalizedInboundMessage {
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

export interface ChannelTarget {
  channelId: string;        // adapter instance id
  conversationId: string;   // where replies go
  senderId?: string;        // actual sender in group/thread
  threadId?: string;
}

export interface ChannelCapabilities {
  text: boolean;
  sendMedia: boolean;
  receiveMedia: boolean;
  reactions: boolean;
  typing: boolean;
  groups: boolean;
  threads: boolean;
}

export interface OutboundMedia {
  filePath: string;
  mimeType: string;
  caption?: string;
}

export interface InboundMedia {
  type: 'image' | 'audio' | 'video' | 'document';
  mimeType: string;
  path: string;
  caption?: string;
  description?: string;
  transcription?: string;
}
```

```typescript
// services/channels/registry.ts [~50 LOC]
export class ChannelRegistry {
  private providers = new Map<string, ChannelProvider>();

  register<TConfig>(provider: ChannelProvider<TConfig>): void {
    this.providers.set(provider.type, provider);
  }

  async createAdapter(
    entry: ChannelEntry,
    context: ChannelProviderContext,
  ): Promise<ChannelAdapter | null> {
    const provider = this.providers.get(entry.type);
    if (!provider) return null;

    const config = provider.validateConfig(entry);
    return provider.createAdapter(config, context);
  }

  listTypes(): string[] {
    return Array.from(this.providers.keys());
  }
}
```

```typescript
// services/channels/pipeline.ts [~200 LOC]
export class ChannelPipeline {
  constructor(
    private config: AppConfig,
    private bus: Bus,
  ) {}

  async process(normalized: NormalizedInboundMessage): Promise<void> {
    const channelEntry = this.config.channels.find(
      (c) => c.id === normalized.target.channelId,
    );
    if (!channelEntry) return;

    // 1. Whitelist check
    if (channelEntry.allowFrom?.length) {
      const isWhitelisted = await this.checkWhitelist(
        normalized.sender.id,
        channelEntry.allowFrom,
      );
      if (!isWhitelisted) {
        normalized.shouldAct = false;
      }
    }

    // 2. Skip-agent determination
    if (!normalized.shouldAct) {
      await this.bus.call('agent.appendMessage', {
        sessionKey: this.buildSessionKey(normalized.target),
        task: normalized.text,
        metadata: { cwd: channelEntry.cwd },
      });
      return;
    }

    // 3. Link expansion
    if (normalized.text) {
      normalized.text = await this.expandLinks(normalized.text);
    }

    // 4. Setup typing + reactions
    const adapter = this.getAdapter(normalized.target.channelId);
    await adapter?.sendTyping(normalized.target, 'typing');

    // 5. Execute agent
    const metadata = this.buildMetadata(normalized, channelEntry);
    await this.bus.call('agent.execute', {
      sessionKey: this.buildSessionKey(normalized.target),
      task: normalized.text,
      metadata,
    });
  }

  private async checkWhitelist(senderId: string, allowFrom: string[]): Promise<boolean> {
    const normalized = senderId.replace(/^\+/, '').replace(/@[^@]+$/, '');
    const allowSet = new Set(allowFrom.map((p) => p.replace(/^\+/, '')));
    return allowSet.has(normalized) || allowSet.has(senderId.replace(/^\+/, ''));
  }

  private async expandLinks(text: string): Promise<string> {
    return this.bus.call('url-expand', {
      text,
      config: this.config.linkExpand,
    });
  }

  private buildMetadata(
    normalized: NormalizedInboundMessage,
    channelEntry: ChannelEntry,
  ): InboundMessageMetadata {
    return {
      messageId: normalized.id,
      fromUser: normalized.sender.displayName || normalized.sender.username,
      chatType: normalized.chatType === 'private' ? 'private' : 'group',
      isMentioned: normalized.isMentioned,
      channelType: normalized.target.channelId,
      cwd: channelEntry.cwd,
      model: channelEntry.model,
      instructionsFile: channelEntry.instructionsFile,
    };
  }

  private buildSessionKey(target: ChannelTarget): string {
    const parts = [target.channelId, target.conversationId];
    if (target.senderId) parts.push(target.senderId);
    if (target.threadId) parts.push(target.threadId);
    return parts.join(':');
  }

  private getAdapter(channelId: string): ChannelAdapter | undefined {
    // Populated by ChannelService
    return this.adapters.get(channelId);
  }
}
```

```typescript
// services/channels/outbound.ts [~100 LOC]
export class OutboundDispatcher {
  constructor(private adapters: Map<string, ChannelAdapter>) {}

  async sendText(target: ChannelTarget, text: string): Promise<void> {
    const adapter = this.adapters.get(target.channelId);
    if (!adapter) throw new Error(`No adapter for ${target.channelId}`);

    const cleaned = stripMarkdown(text);
    const chunks = await this.chunkText(cleaned);

    for (const chunk of chunks) {
      await retry(
        () => adapter.sendText(target, chunk),
        { maxRetries: 3, baseMs: 1000 },
      );
    }
  }

  async sendMedia(target: ChannelTarget, media: OutboundMedia): Promise<void> {
    const adapter = this.adapters.get(target.channelId);
    if (!adapter?.getCapabilities().sendMedia) {
      throw new Error(`${target.channelId} does not support media`);
    }

    await adapter.sendMedia!(target, media);
  }

  private async chunkText(text: string): Promise<string[]> {
    if (text.length <= 4000) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      let splitAt = remaining.lastIndexOf('\n\n', 4000);
      if (splitAt <= 0) splitAt = remaining.lastIndexOf('\n', 4000);
      if (splitAt <= 0) splitAt = remaining.lastIndexOf('. ', 4000);
      if (splitAt <= 0) splitAt = 4000;

      chunks.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }

    return chunks;
  }
}
```

```typescript
// services/channels/base-adapter.ts [~150 LOC]
export abstract class BaseChannelAdapter implements ChannelAdapter {
  readonly type: string;
  readonly instanceId: string;
  status: ChannelStatus = 'disconnected';

  protected dedupe = createDedupeCache({ ttlMs: 120_000 });
  protected debouncer = createMessageDebouncer(
    (id, messages, metadata) => this.handleBatch(id, messages, metadata),
    { delayMs: 2000 },
  );
  protected typingState = new TypingStateManager();
  protected latestMessageId = new Map<string, string>();
  protected log = createLogger(this.instanceId);

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract sendText(target: ChannelTarget, text: string): Promise<void>;
  abstract normalizeInbound(raw: unknown): Promise<NormalizedInboundMessage | null>;
  abstract getCapabilities(): ChannelCapabilities;

  async sendTyping(target: ChannelTarget, state: 'typing' | 'paused' | 'stopped'): Promise<void> {
    switch (state) {
      case 'typing':
        this.typingState.start(target.conversationId, () =>
          this.sendTypingIndicator(target),
        );
        break;
      case 'paused':
        this.typingState.pause(target.conversationId);
        break;
      case 'stopped':
        this.typingState.stop(target.conversationId, true);
        break;
    }
  }

  protected abstract sendTypingIndicator(target: ChannelTarget): Promise<void>;

  buildTargetFromSessionKey(sessionKey: string): ChannelTarget {
    const parts = sessionKey.split(':');
    return {
      channelId: parts[0],
      conversationId: parts[1],
      senderId: parts[2],
      threadId: parts[3],
    };
  }

  buildSessionKey(target: ChannelTarget): string {
    const parts = [target.channelId, target.conversationId];
    if (target.senderId) parts.push(target.senderId);
    if (target.threadId) parts.push(target.threadId);
    return parts.join(':');
  }

  protected async handleBatch(
    id: string,
    messages: string[],
    metadata?: any,
  ): Promise<void> {
    // Subclasses override to normalize and emit
  }

  protected cleanupTimers(): void {
    this.debouncer.flushAll();
    this.typingState.cleanup();
  }
}
```

```typescript
// services/channels/media.ts [~80 LOC]
export class ChannelMediaPipeline {
  constructor(
    private transcribe: (filePath: string) => Promise<string>,
    private describe: (filePath: string) => Promise<string>,
  ) {}

  async processInboundMedia(
    buffer: Buffer,
    mimeType: string,
    mediaType: 'image' | 'audio' | 'video' | 'document',
    caption?: string,
  ): Promise<InboundMedia> {
    const savedPath = await this.saveMedia(buffer, mimeType);
    const inboundMedia: InboundMedia = {
      type: mediaType,
      mimeType,
      path: savedPath,
      caption,
    };

    if (mediaType === 'image' && this.describe) {
      try {
        inboundMedia.description = await this.describe(savedPath);
      } catch {
        // Fall back to caption
      }
    }

    if (mediaType === 'audio' && this.transcribe) {
      try {
        inboundMedia.transcription = await this.transcribe(savedPath);
      } catch {
        // Fall back to caption
      }
    }

    return inboundMedia;
  }

  private async saveMedia(buffer: Buffer, mimeType: string): Promise<string> {
    // Use lib/media.ts
    return saveMedia({
      buffer,
      mimeType,
      mediaDir: path.join(getDataPaths().dataDir, 'media'),
    });
  }
}
```

---

### Provider Structure (Each Self-Contained)

#### Telegram Provider

```typescript
// services/channels/providers/telegram/index.ts
export const TelegramProvider: ChannelProvider<TelegramChannel> = {
  type: 'telegram',

  validateConfig(config: unknown): TelegramChannel {
    return TelegramChannelSchema.parse(config);
  },

  async createAdapter(config: TelegramChannel, context: ChannelProviderContext) {
    return new TelegramAdapter(config.id, config.botToken, context);
  },
};

// services/channels/providers/telegram/adapter.ts
export class TelegramAdapter extends BaseChannelAdapter {
  readonly type = 'telegram';

  constructor(
    instanceId: string,
    private botToken: string,
    private context: ChannelProviderContext,
  ) {
    super();
    this.instanceId = instanceId;
  }

  async start(): Promise<void> {
    // Long polling, etc.
  }

  async stop(): Promise<void> { … }

  async sendText(target: ChannelTarget, text: string): Promise<void> {
    const chatId = target.conversationId;
    await this.apiCall('sendMessage', { chat_id: chatId, text });
  }

  async normalizeInbound(raw: TelegramUpdate): Promise<NormalizedInboundMessage | null> {
    const normalized = TelegramNormalizer.normalize(raw, this.botUser);
    if (!normalized) return null;

    this.latestMessageId.set(normalized.sender.id, normalized.id);
    return normalized;
  }

  protected async sendTypingIndicator(target: ChannelTarget): Promise<void> {
    await this.apiCall('sendChatAction', {
      chat_id: target.conversationId,
      action: 'typing',
    });
  }

  getCapabilities(): ChannelCapabilities {
    return {
      text: true,
      sendMedia: true,
      receiveMedia: true,
      reactions: true,
      typing: true,
      groups: true,
      threads: false,
    };
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const normalized = await this.normalizeInbound(update);
    if (!normalized) return;

    const sessionKey = this.buildSessionKey(normalized.target);
    await this.context.onInboundMessage(sessionKey, normalized.text || '', {
      raw: normalized,
    });
  }
}

// services/channels/providers/telegram/normalizer.ts
export class TelegramNormalizer {
  static normalize(
    update: TelegramUpdate,
    botUser: TelegramUser,
  ): NormalizedInboundMessage | null {
    const msg = update.message;
    if (!msg) return null;
    if (!msg.text && !msg.photo && !msg.voice && !msg.audio) return null;
    if (msg.from?.id === botUser.id) return null;

    const chatType = msg.chat.type === 'private' ? 'private' : 'group';
    const isMentioned = chatType === 'private' || this.isMentioned(msg, botUser);

    return {
      id: String(msg.message_id),
      target: {
        channelId: 'telegram-1', // From config
        conversationId: String(msg.chat.id),
        senderId: String(msg.from!.id),
      },
      text: msg.text,
      sender: {
        id: String(msg.from!.id),
        displayName: msg.from?.first_name,
        username: msg.from?.username,
      },
      chatType,
      fromSelf: false,
      isMentioned,
      shouldAct: chatType === 'private' || isMentioned,
      timestamp: msg.date,
    };
  }

  private static isMentioned(msg: TelegramMessage, botUser: TelegramUser): boolean {
    if (!msg.text) return false;
    return msg.text.includes(`@${botUser.username}`);
  }
}

// services/channels/providers/telegram/types.ts
// Telegram protocol types (unchanged)
```

#### WhatsApp Provider (Same Pattern)

```typescript
// services/channels/providers/whatsapp/index.ts
export const WhatsAppProvider: ChannelProvider<WhatsAppChannel> = {
  type: 'whatsapp',
  validateConfig(config: unknown) { … },
  async createAdapter(config, context) { … },
};

// services/channels/providers/whatsapp/adapter.ts
export class WhatsAppAdapter extends BaseChannelAdapter {
  // Same contract as Telegram
  // Delegates inbound normalization to WhatsAppNormalizer
}

// services/channels/providers/whatsapp/normalizer.ts
export class WhatsAppNormalizer {
  static normalize(msg: WhatsAppInboundMessage, botJid: string): NormalizedInboundMessage | null {
    // WhatsApp-specific normalization (JID resolution, LID cache, mention detection)
  }
}

// services/channels/providers/whatsapp/client.ts
// Renamed from session.ts, owns Baileys integration
```

#### Slack Provider (Future — Validates Pattern)

```typescript
// services/channels/providers/slack/index.ts
export const SlackProvider: ChannelProvider<SlackChannel> = {
  type: 'slack',
  validateConfig(config: unknown) { … },
  async createAdapter(config, context) { … },
};

// services/channels/providers/slack/adapter.ts
export class SlackAdapter extends BaseChannelAdapter {
  // Same contract as Telegram/WhatsApp
}

// services/channels/providers/slack/normalizer.ts
export class SlackNormalizer {
  static normalize(event: SlackEvent, botUserId: string): NormalizedInboundMessage | null {
    // Slack-specific normalization
  }
}
```

---

## Separation of Concerns (Unmistakable)

| File | Owns | Does NOT Own |
|------|------|---|
| **ChannelService (index.ts)** | Bus integration, adapter lifecycle, session tracking, reply sending | Policy logic, platform details, message normalization |
| **ChannelPipeline** | Whitelist, skipAgent, link expansion, typing state, agent.execute | Platform details, message normalization |
| **ChannelRegistry** | Type → provider mapping | Adapter creation details (delegates to provider) |
| **OutboundDispatcher** | Text chunking, media dispatch, retry | Platform-specific send logic (delegates to adapter) |
| **BaseChannelAdapter** | Typing lifecycle, debounce, dedupe, session key parsing | Platform-specific protocol, normalization |
| **Provider** | Config validation, adapter factory | Everything (platform-specific code lives in adapter) |
| **Adapter** | Connect, send, receive, normalize, capabilities | Policy (skip-agent, whitelist, typing strategy) |
| **Normalizer** | Translate raw event to NormalizedInboundMessage | Policy decisions (shouldAct is set by pipeline after whitelist check) |

---

## Refactor Phases (Your Proposed Order is Better)

| Phase | What | LOC Change | Files | Time | Risk |
|-------|------|---|---|------|------|
| **0** | Fix WhatsApp dead return, add characterization tests | 0 | 0 | 2h | 1/10 |
| **1** | Add contracts.ts without changing behavior | +100 | +1 | 2h | 1/10 |
| **2** | Add registry.ts, ChannelRegistry | +50 | +1 | 1h | 1/10 |
| **3** | Move Telegram/WhatsApp creation into providers/ | 0 | +4 | 2h | 2/10 |
| **4** | Add NormalizedInboundMessage in contracts.ts, adapt normalizers | +150 | +2 | 3h | 2/10 |
| **5** | Extract pipeline.ts, move policy from index.ts | -100 | +1 | 3h | 2/10 |
| **6** | Adapters emit NormalizedInboundMessage, pipeline processes | -50 | 0 | 2h | 2/10 |
| **7** | Add Slack provider as validation | 0 | +3 | 2h | 1/10 |

**Total: 17 hours, 1–2/10 risk, 7 phases of incremental de-risking**

---

## Critical First Fix

**WhatsApp adapter currently has a logic error:**

```typescript
// services/channels/whatsapp/adapter.ts:253–270 (handleMedia)
private async handleMedia(msg: WhatsAppInboundMessage, chatType: 'private' | 'group', isMentioned: boolean, skipAgent: boolean): Promise<void> {
  if (!this.onInboundMessage) {
    this.log.error('No inbound message handler');
    return;  // ⚠️ BUG: Returns before processing media, logging is lost
  }

  const userId = this.buildUserId(msg.jid);
  const sessionKey = this.buildSessionKey(userId);

  const metadata: InboundMessageMetadata = {
    messageId: msg.messageId,
    fromUser: this.resolvePhone(msg.jid),
    chatType,
    isMentioned,
    channelType: 'whatsapp',
    skipAgent,
    // ❌ Missing: fromUserId
  };

  // … continues with processInboundMedia
}
```

**Fix (Phase 0):**
1. Add `fromUserId: msg.jid` to metadata
2. Fix early return logic (don't return, throw instead)

---

## Your Tree (Final Approved)

```
services/channels/
├── index.ts                    # ChannelService orchestrator
├── contracts.ts                # All interfaces & types
├── registry.ts                 # ChannelRegistry
├── pipeline.ts                 # Inbound processing policy
├── outbound.ts                 # Send/media orchestration
├── base-adapter.ts             # BaseChannelAdapter
├── media.ts                    # Channel media pipeline
│
├── providers/
│   ├── telegram/
│   │   ├── index.ts            # TelegramProvider
│   │   ├── adapter.ts          # TelegramAdapter
│   │   ├── normalizer.ts       # TelegramNormalizer
│   │   └── types.ts            # Telegram types
│   │
│   ├── whatsapp/
│   │   ├── index.ts            # WhatsAppProvider
│   │   ├── adapter.ts          # WhatsAppAdapter
│   │   ├── normalizer.ts       # WhatsAppNormalizer
│   │   ├── client.ts           # Baileys integration (session.ts → client.ts)
│   │   └── types.ts            # WhatsApp types
│   │
│   └── slack/
│       ├── index.ts            # SlackProvider (future)
│       ├── adapter.ts          # SlackAdapter
│       ├── normalizer.ts       # SlackNormalizer
│       └── types.ts
│
└── __tests__/
    ├── contract/               # ChannelAdapter contract tests
    ├── pipeline/               # Pipeline logic tests
    ├── providers/              # Provider-specific tests
    └── e2e/                    # End-to-end tests
```

---

## Why This is Production-Ready

✅ **Each provider is self-contained** — add Slack without touching core  
✅ **Clear responsibility boundaries** — no overlap, no ambiguity  
✅ **Normalizer pattern prevents drift** — consistent inbound shape  
✅ **ChannelTarget is extensible** — supports threads, nested conversations  
✅ **ChannelCapabilities is explicit** — no optional method guessing  
✅ **Pipeline is policy owner** — ChannelService is pure orchestrator  
✅ **Incremental refactor** — 7 phases, each phase shippable  
✅ **Low risk throughout** — 1–2/10 max, phases are atomic  
✅ **Slack-ready** — new provider = 4 files, no core changes  

This is **the approach to ship.**
