# Vargos Channels: Final Architecture & Scalable Design

## Core Principle

**Channels is about ONE thing: routing inbound messages to agents and sending replies back.**

Everything else (debouncing, deduping, chunking, retrying, backoff) is **generic infrastructure** that belongs in `lib/` and should be reusable by other services (webhooks, rate-limiters, log aggregators, etc.).

---

## 1. Separation of Concerns: What Lives Where

### ✅ MOVE TO `lib/` (Generic, Reusable)

These are NOT channel-specific. Other services will want them.

```
lib/
├── debouncer.ts          ← Generic: accumulate events, flush after delay
├── dedupe.ts             ← Generic: time-windowed deduplication cache
├── exponential-backoff.ts ← Generic: retry with exponential backoff (rename reconnect.ts)
├── chunked-send.ts       ← Generic: split text/data on boundaries + retry
└── [Already exist]
    ├── retry.ts          ← Generic: retry with backoff
    ├── sleep.ts          ← Generic: sleep helper
    ├── url-expand.ts     ← Generic: fetch URL content
    ├── media.ts          ← Generic: media file operations
    └── logger.ts         ← Generic: logging
```

**Why move?**
- Debouncer: rate-limiters, batch processors, any "accumulate and flush" pattern
- Dedupe: webhooks, event processors, any "dedup by ID" pattern
- Exponential backoff: any service that needs resilience
- Chunked send: any service sending paginated/sized data

**Migration:** Update imports in channels/ to use `lib/debouncer` instead of `./debounce`.

### ✅ STAY IN `services/channels/` (Channel-Specific)

Only adapter implementations and the orchestrator.

```
services/channels/
├── index.ts                    ← ChannelService (what it is now)
├── adapter.ts                  ← ChannelAdapter base class
├── types.ts                    ← ChannelAdapter interface, types
├── inbound-pipeline.ts         ← Normalize + whitelist + skip-agent
│
├── telegram/adapter.ts         ← Telegram-specific protocol handling
├── whatsapp/adapter.ts         ← WhatsApp-specific protocol handling
├── slack/adapter.ts            ← Slack-specific protocol handling (future)
└── discord/adapter.ts          ← Discord-specific protocol handling (future)
```

---

## 2. ChannelAdapter: The Core Abstraction

### Complete Interface (Every adapter must implement)

```typescript
// services/channels/adapter.ts

export abstract class ChannelAdapter {
  // ──────────────────────────────────────────────────────────────────
  // IDENTITY (read-only)
  // ──────────────────────────────────────────────────────────────────
  readonly type: ChannelType;          // 'telegram' | 'whatsapp' | 'slack' | 'discord'
  readonly instanceId: string;         // From config.channels[].id
  status: ChannelStatus;               // 'disconnected' | 'connecting' | 'connected' | 'error'

  // ──────────────────────────────────────────────────────────────────
  // LIFECYCLE — Must implement
  // ──────────────────────────────────────────────────────────────────

  /**
   * Connect to the platform and start receiving messages.
   * Throw on auth failure; emit channel.onConnected when ready.
   */
  abstract start(): Promise<void>;

  /**
   * Gracefully disconnect. Safe to call multiple times.
   * Best-effort cleanup (no throw).
   */
  abstract stop(): Promise<void>;

  // ──────────────────────────────────────────────────────────────────
  // OUTBOUND — Must implement send()
  // ──────────────────────────────────────────────────────────────────

  /**
   * Send text message to recipient.
   * Session key format: {instanceId}:{userId} where userId is reply destination.
   * Text is pre-cleaned (markdown stripped). Respect platform size limits.
   *
   * @throws on network error, invalid recipient, rate limit
   */
  abstract send(sessionKey: string, text: string): Promise<void>;

  /**
   * [OPTIONAL] Send media file to recipient.
   * Only implement if your platform supports file uploads.
   *
   * @param sessionKey  Canonical session key
   * @param filePath    Absolute path to file on disk
   * @param mimeType    MIME type (e.g., 'image/jpeg')
   * @param caption     Optional caption/title
   * @throws on file not found, unsupported type, network error
   */
  sendMedia?(sessionKey: string, filePath: string, mimeType: string, caption?: string): Promise<void>;

  /**
   * [OPTIONAL] React to a message with emoji.
   * Only implement if your platform supports reactions.
   *
   * @param sessionKey  Canonical session key
   * @param messageId   Platform-specific message ID (stored by adapter)
   * @param emoji       Single emoji character (e.g., '👍', '🤔')
   * @throws on invalid emoji, message not found
   */
  react?(sessionKey: string, messageId: string, emoji: string): Promise<void>;

  // ──────────────────────────────────────────────────────────────────
  // TYPING INDICATOR — Must implement sendTypingIndicator()
  // ──────────────────────────────────────────────────────────────────

  /**
   * [ABSTRACT] Send platform-specific typing indicator.
   * Called every 4 seconds by TypingStateManager while agent is thinking.
   * May fail non-critically (failures logged, after 3 failures typing stops).
   *
   * Implementation tips:
   *   - Telegram: apiCall('sendChatAction', { action: 'typing' })
   *   - WhatsApp: sock.sendPresenceUpdate('composing', jid)
   *   - Slack: no-op (Slack doesn't support typing)
   *   - Discord: no-op (Discord has slow typing)
   *
   * @throws on network error (non-critical)
   */
  protected abstract sendTypingIndicator(sessionKey: string): Promise<void>;

  /**
   * Start typing indicator (template method, calls sendTypingIndicator every 4s).
   * Auto-pauses after 2 minutes. Auto-resumes on tool execution.
   *
   * @param sessionKey      Canonical session key
   * @param inToolExecution Set true if agent is executing a tool
   */
  startTyping(sessionKey: string, inToolExecution?: boolean): void;

  /**
   * Resume typing after tool completes (no-op if not in tool execution mode).
   */
  resumeTyping(sessionKey: string): void;

  /**
   * Stop typing indicator.
   *
   * @param sessionKey Canonical session key
   * @param final      If true, clear all state. If false, just stop current cycle.
   */
  stopTyping(sessionKey: string, final?: boolean): void;

  // ──────────────────────────────────────────────────────────────────
  // SESSION MANAGEMENT — Provided by base class
  // ──────────────────────────────────────────────────────────────────

  /**
   * Extract user/recipient ID from session key.
   * Reverses transformation: sessionKey = buildSessionKey(userId).
   *
   * Example: "telegram-1:12345" → "12345"
   * Default: splits on ':' and takes part after ':'.
   * Override if your session key format differs.
   */
  extractUserId(sessionKey: string): string {
    return sessionKey.split(':')[1];
  }

  /**
   * Get latest message ID for a user (used for reactions).
   * Adapter tracks this internally when processing inbound messages.
   * Called by reaction controller.
   *
   * Default: returns undefined (no reactions).
   * Override to track message IDs if react() is implemented.
   */
  extractLatestMessageId(userId: string): string | undefined {
    return undefined;
  }

  // ──────────────────────────────────────────────────────────────────
  // INBOUND MESSAGE HANDLING — Adapter's Job
  // ──────────────────────────────────────────────────────────────────

  /**
   * Inbound handler callback (set by ChannelService).
   * Adapter calls this when a message is ready to process.
   *
   * Signature:
   *   onInboundMessage(sessionKey, text, metadata?)
   *
   * Adapter's job:
   *   1. Receive protocol-specific message
   *   2. Dedupe by message ID
   *   3. Batch/debounce (accumulate rapid messages)
   *   4. Extract metadata (messageId, fromUser, chatType, isMentioned, fromUserId)
   *   5. Call onInboundMessage(sessionKey, text, metadata)
   */
  protected onInboundMessage?: (
    sessionKey: string,
    text: string,
    metadata?: InboundMessageMetadata,
  ) => Promise<void>;

  /**
   * Set the inbound message handler (called by ChannelService on init).
   */
  setOnInboundMessage(handler: typeof this.onInboundMessage): void {
    this.onInboundMessage = handler;
  }
}
```

### Methods Every Channel Must Implement (Checklist)

```typescript
// REQUIRED (all adapters)
✓ start()                           // Connect
✓ stop()                            // Disconnect
✓ send(sessionKey, text)            // Send text
✓ protected sendTypingIndicator()   // Platform typing (can be no-op)
✓ Inbound routing                   // Parse protocol messages, emit to onInboundMessage

// OPTIONAL (implement if platform supports)
? sendMedia(sessionKey, filePath, mimeType, caption?)
? react(sessionKey, messageId, emoji)

// PROVIDED BY BASE CLASS (no override needed)
✓ startTyping / resumeTyping / stopTyping
✓ extractUserId(sessionKey)
✓ extractLatestMessageId(userId)
✓ Deduplication (via lib/dedupe)
✓ Debouncing (via lib/debouncer)
✓ Reconnection (via lib/exponential-backoff)
```

---

## 3. Directory Structure: Scalable for N Adapters

```
services/channels/
│
├── 📄 index.ts [CORE ORCHESTRATOR]
│   ├─ ChannelService
│   │  ├─ adapter lifecycle (start/stop)
│   │  ├─ session tracking (activeSessions)
│   │  ├─ reply delivery (send + sendMedia)
│   │  ├─ agent event handlers (onTool, onCompleted)
│   │  ├─ typing + reactions coordination
│   │  └─ boot(bus)
│   └─ ChannelProviderRegistry
│      ├─ register('telegram', factory)
│      ├─ register('whatsapp', factory)
│      ├─ register('slack', factory)      [Future]
│      └─ register('discord', factory)    [Future]
│
├── 📄 types.ts [INTERFACE]
│   ├─ ChannelAdapter (interface)
│   ├─ ChannelType, ChannelStatus
│   ├─ InboundMessageMetadata
│   └─ OnInboundMessageFn
│
├── 📄 adapter.ts [BASE CLASS]
│   ├─ ChannelAdapter (abstract class)
│   ├─ Lifecycle: start/stop (abstract)
│   ├─ Outbound: send (abstract), sendMedia?, react?
│   ├─ Typing: startTyping/resumeTyping/stopTyping (template methods)
│   ├─ Session: extractUserId, extractLatestMessageId, buildSessionKey
│   ├─ Inbound: onInboundMessage callback, setOnInboundMessage
│   └─ Utilities: logging, cleanup timers
│
├── 📄 inbound-pipeline.ts [MESSAGE NORMALIZATION]
│   ├─ NormalizedInboundMessage (type)
│   ├─ normalizeMetadata() [pure]
│   ├─ checkWhitelist() [pure]
│   ├─ calculateSkipAgent() [pure]
│   └─ InboundMessagePipeline (orchestrator)
│
├── 📁 telegram/ [PROVIDER]
│   ├── adapter.ts (367 LOC)
│   │   ├─ TelegramAdapter extends ChannelAdapter
│   │   ├─ Long-polling loop (protocol-specific)
│   │   ├─ handleUpdate(msg) (protocol-specific)
│   │   ├─ Mention detection (platform-specific)
│   │   ├─ Media handling (platform-specific)
│   │   └─ [NO: metadata building, debounce, whitelist, typing, reactions]
│   └── types.ts (72 LOC)
│       └─ Telegram types (TelegramMessage, TelegramUpdate, etc.)
│
├── 📁 whatsapp/ [PROVIDER]
│   ├── adapter.ts (318 LOC)
│   │   ├─ WhatsAppAdapter extends ChannelAdapter
│   │   ├─ Baileys integration (protocol-specific)
│   │   ├─ handleInbound(msg) (protocol-specific)
│   │   ├─ Mention detection (platform-specific)
│   │   ├─ JID normalization (platform-specific)
│   │   ├─ LID cache (platform-specific)
│   │   └─ [NO: metadata building, debounce, whitelist, typing, reactions]
│   ├── session.ts (148 LOC)
│   │   └─ createWhatsAppSocket (Baileys setup)
│   └── types.ts (23 LOC)
│       └─ WhatsApp types (WASocket, WhatsAppInboundMessage, etc.)
│
├── 📁 slack/ [PROVIDER — FUTURE]
│   ├── adapter.ts
│   │   ├─ SlackAdapter extends ChannelAdapter
│   │   ├─ WebSocket/Event API integration
│   │   ├─ handleSlackEvent(msg)
│   │   ├─ Mention detection (@botid)
│   │   └─ [Same pattern as Telegram/WhatsApp]
│   └── types.ts
│       └─ Slack types
│
├── 📁 discord/ [PROVIDER — FUTURE]
│   ├── adapter.ts
│   │   ├─ DiscordAdapter extends ChannelAdapter
│   │   ├─ Discord.js integration
│   │   ├─ handleDiscordMessage(msg)
│   │   ├─ Guild/DM detection
│   │   └─ [Same pattern]
│   └── types.ts
│
└── 📁 __tests__/
    ├── unit/
    │   ├── adapter.test.ts [ChannelAdapter contract, typing lifecycle]
    │   ├── inbound-pipeline.test.ts [Normalization, whitelist, skip-agent]
    │   ├── telegram/metadata-building.test.ts [Telegram-specific metadata]
    │   ├── whatsapp/metadata-building.test.ts [WhatsApp-specific metadata]
    │   ├── whitelist-enforcement.test.ts [Whitelist edge cases]
    │   └── [Provider-specific tests]
    └── e2e/
        ├── channels.e2e.test.ts [End-to-end inbound → agent → outbound]
        └── media.e2e.test.ts [Media handling]
```

**Total: 7–8 production files + N provider folders + tests**

---

## 4. What Moves to `lib/`

### `lib/debouncer.ts` (Generic)

```typescript
// Generic message debouncer (reusable by any service)
export interface Debouncer<T> {
  push(key: string, value: T): void;
  flush(key: string): void;
  flushAll(): void;
}

export function createDebouncer<T>(
  onFlush: (key: string, values: T[]) => void,
  opts: { delayMs?: number; maxBatch?: number } = {},
): Debouncer<T> { … }
```

**Used by:**
- channels: accumulate rapid messages per sender
- webhooks: accumulate rapid webhook events per source
- rate-limiter: accumulate rapid requests per IP

---

### `lib/dedupe.ts` (Generic)

```typescript
// Generic deduplication cache (reusable)
export interface DedupeCache {
  has(key: string): boolean;
  add(key: string): boolean;  // Returns true if was new
  size: number;
}

export function createDedupeCache(opts?: { ttlMs?: number; maxSize?: number }): DedupeCache { … }
```

**Used by:**
- channels: dedupe messages by platform message ID
- webhooks: dedupe duplicate webhook deliveries
- event processors: dedupe event IDs

---

### `lib/exponential-backoff.ts` (Renamed from `reconnect.ts`)

```typescript
// Generic exponential backoff (reusable)
export class ExponentialBackoff {
  next(): number | null;  // Returns delay or null if max attempts reached
  reset(): void;
}

export function createExponentialBackoff(config?: {
  baseMs?: number;
  maxMs?: number;
  maxAttempts?: number;
}): ExponentialBackoff { … }
```

**Used by:**
- channels: reconnect with backoff
- http client: retry with backoff
- database client: retry with backoff

---

### `lib/chunked-send.ts` (Generic)

```typescript
// Generic chunking + retry (reusable)
export type SendFn<T> = (chunk: T) => Promise<void>;

export async function sendChunked<T>(
  items: T[],
  send: SendFn<T>,
  opts?: {
    maxChunkSize?: number;
    chunkDelayMs?: number;
    maxRetries?: number;
  },
): Promise<void> { … }
```

**Used by:**
- channels: chunk text on boundaries + retry
- log shipper: chunk logs + retry
- analytics: chunk events + retry

---

### Keep in `services/channels/`

Only **channel-specific** logic:

1. **inbound-pipeline.ts** — Normalize messages, check whitelist, determine skipAgent
   - Specific to channels (uses InboundMessageMetadata, allowFrom config)
   
2. **adapter.ts** — ChannelAdapter base class
   - Specific to channels (knows about typing, reactions, media)
   
3. **index.ts** — ChannelService orchestration
   - Specific to channels (manages adapters, replies, agent coordination)

4. **{telegram,whatsapp,slack}/adapter.ts** — Protocol implementations
   - Specific to each platform

---

## 5. Data Flow (After Refactor)

```
┌─ INBOUND FLOW ─────────────────────────────────────────────────────┐
│                                                                      │
│ Platform message (Telegram, WhatsApp, Slack)                       │
│        ↓                                                             │
│ Adapter.handleInbound() [protocol-specific]                        │
│        ├─ Dedupe via lib/dedupe-cache                              │
│        ├─ Debounce via lib/debouncer                               │
│        ├─ Extract metadata (messageId, fromUser, isMentioned)      │
│        └─ Call onInboundMessage(sessionKey, text, metadata)        │
│        ↓                                                             │
│ ChannelService.onInboundMessage()                                  │
│        ├─ Call pipeline.process(raw) → NormalizedInboundMessage    │
│        │  ├─ normalizeMetadata(adapter + config)                   │
│        │  ├─ checkWhitelist(fromUserId, allowFrom)                 │
│        │  ├─ calculateSkipAgent(chatType, isMentioned, whitelist)  │
│        │  └─ expandLinks(text)                                     │
│        ├─ Start typing indicator                                   │
│        ├─ Setup reaction controller (if supported)                 │
│        └─ Call agent.execute(sessionKey, text, metadata)           │
│        ↓                                                             │
│ Agent processes (LLM execution, tool calls)                        │
│        ↓                                                             │
│ ChannelService.onAgentCompleted()                                  │
│        ├─ Send reply via channel.send()                            │
│        ├─ Stop typing                                              │
│        ├─ Update reaction (done/error)                             │
│        └─ Clean up session                                         │
│        ↓                                                             │
└─ OUTBOUND FLOW ────────────────────────────────────────────────────┘

┌─ OUTBOUND FLOW ────────────────────────────────────────────────────┐
│                                                                      │
│ channel.send(sessionKey, text)                                     │
│        ↓                                                             │
│ ChannelService.send()                                              │
│        ├─ Strip markdown                                           │
│        ├─ Extract media paths                                      │
│        ├─ Call sendChunked() [lib/chunked-send]                    │
│        │  └─ Split text on boundaries + retry per chunk            │
│        ├─ For each media: call adapter.sendMedia()                 │
│        └─ Return { sent: true }                                    │
│        ↓                                                             │
│ Adapter.send(sessionKey, chunk)                                    │
│        ├─ Extract userId from sessionKey                           │
│        ├─ Call platform API                                        │
│        └─ Return                                                    │
│        ↓                                                             │
└─ Message delivered ───────────────────────────────────────────────┘
```

---

## 6. Scalability: Adding Slack

### Step 1: Create `services/channels/slack/adapter.ts`

```typescript
import { ChannelAdapter } from '../adapter.js';
import type { OnInboundMessageFn, InboundMessageMetadata } from '../types.js';

export class SlackAdapter extends ChannelAdapter {
  readonly type = 'slack' as const;

  private client: SlackClient | null = null;
  private botUserId = '';

  constructor(
    instanceId: string,
    private botToken: string,
    onInboundMessage?: OnInboundMessageFn,
  ) {
    super(instanceId);
    this.setOnInboundMessage(onInboundMessage);
  }

  async start(): Promise<void> {
    this.status = 'connecting';
    this.client = new SlackClient({ token: this.botToken });
    const auth = await this.client.auth.test();
    this.botUserId = auth.user_id;
    this.status = 'connected';

    // Start event listener
    this.client.on('message', (msg) => this.handleSlackMessage(msg));
  }

  async stop(): Promise<void> {
    await this.client?.disconnect();
    this.client = null;
    this.status = 'disconnected';
  }

  async send(sessionKey: string, text: string): Promise<void> {
    const channelId = this.extractUserId(sessionKey);
    await this.client?.chat.postMessage({ channel: channelId, text });
  }

  async sendMedia(sessionKey: string, filePath: string, mimeType: string, _caption?: string): Promise<void> {
    const channelId = this.extractUserId(sessionKey);
    const buffer = readFileSync(filePath);
    await this.client?.files.uploadV2({
      channel_id: channelId,
      file: buffer,
      filename: basename(filePath),
    });
  }

  protected async sendTypingIndicator(_sessionKey: string): Promise<void> {
    // Slack doesn't have typing indicator, no-op
  }

  private async handleSlackMessage(msg: SlackMessage): Promise<void> {
    if (msg.bot_id || msg.user === this.botUserId) return;
    if (!msg.text && !msg.files?.length) return;

    const messageId = `${msg.ts}:${msg.channel}`;
    const sessionKey = this.buildSessionKey(msg.user);

    const metadata: InboundMessageMetadata = {
      messageId,
      fromUser: msg.user_name || msg.user,
      chatType: msg.channel_type === 'im' ? 'private' : 'group',
      isMentioned: msg.text.includes(`<@${this.botUserId}>`),
      channelType: 'slack',
      fromUserId: msg.user,
    };

    // Track for reactions
    this.latestMessageId.set(msg.user, messageId);

    // Emit inbound message (ChannelService will normalize it)
    await this.onInboundMessage?.(sessionKey, msg.text, metadata);
  }

  protected buildSessionKey(userId: string): string {
    return `${this.instanceId}:${userId}`;
  }
}
```

### Step 2: Register in `index.ts`

```typescript
// ChannelService.constructor
this.registry.register('slack', (entry) => {
  const cfg = entry as SlackChannel;
  const adapter = new SlackAdapter(entry.id, cfg.botToken, this.onInboundMessage.bind(this));
  adapter.setTranscribeFn(f => this.bus.call('media.transcribeAudio', { filePath: f }).then(r => r.text));
  adapter.setDescribeFn(f => this.bus.call('media.describeImage', { filePath: f }).then(r => r.description));
  return adapter;
});
```

### Step 3: Add config schema

```typescript
// services/config/schemas/channels.ts
export const SlackChannelSchema = ChannelBaseSchema.extend({
  type: z.literal('slack'),
  botToken: z.string(),
});
```

**That's it.** No changes to ChannelService, pipeline, or any shared logic.

---

## 7. Complete Checklist: Every Adapter

When adding a new adapter (Slack, Discord, Mastodon, Telegram, etc.):

### Required Implementation

- [ ] **Extend `ChannelAdapter`**
  ```typescript
  export class MyAdapter extends ChannelAdapter {
    readonly type = 'myplatform' as const;
  }
  ```

- [ ] **Implement `start()`**
  - Connect to platform
  - Authenticate
  - Start receiving messages
  - Set `this.status = 'connected'`
  - Throw on auth failure

- [ ] **Implement `stop()`**
  - Graceful disconnect
  - Cancel timers
  - Best-effort (no throw)

- [ ] **Implement `send()`**
  - Extract userId via `this.extractUserId(sessionKey)`
  - Send via platform API
  - Respect size/rate limits

- [ ] **Implement `sendTypingIndicator()`**
  - Send platform typing indicator
  - Or no-op if not supported

- [ ] **Implement inbound message routing**
  - Receive protocol messages
  - Dedupe by platform message ID
  - Debounce per sender
  - Extract metadata (messageId, fromUser, chatType, isMentioned, **fromUserId**)
  - Track latest message ID: `this.latestMessageId.set(userId, messageId)`
  - Call: `await this.onInboundMessage?.(sessionKey, text, metadata)`

- [ ] **Handle media (if supported)**
  - Extract media from protocol message
  - Call: `await this.onInboundMessage?.(sessionKey, caption, { media: {...} })`

### Optional Implementation

- [ ] **Implement `sendMedia()`** — if platform supports file uploads
- [ ] **Implement `react()`** — if platform supports reactions
- [ ] **Override `extractLatestMessageId()`** — if tracking message IDs for reactions

### Testing

- [ ] **Metadata construction** — correct extraction from protocol messages
- [ ] **Mention detection** — correct per-platform logic
- [ ] **Skip-agent determination** — private=false, group-no-mention=true
- [ ] **Session key round-trip** — `buildSessionKey(userId)` and `extractUserId()` are inverses
- [ ] **Deduplication** — same message ID not processed twice
- [ ] **Debouncing** — rapid messages batched
- [ ] **Media handling** — if supported

---

## 8. Final File Structure

```
services/
├── channels/
│   ├── index.ts [280 LOC]                      ← ChannelService + Registry
│   ├── types.ts [60 LOC]                       ← Interfaces
│   ├── adapter.ts [180 LOC]                    ← ChannelAdapter base class
│   ├── inbound-pipeline.ts [150 LOC]           ← Normalize + whitelist
│   │
│   ├── telegram/
│   │   ├── adapter.ts [350 LOC]                ← Protocol-specific
│   │   └── types.ts [72 LOC]
│   │
│   ├── whatsapp/
│   │   ├── adapter.ts [320 LOC]                ← Protocol-specific
│   │   ├── session.ts [148 LOC]                ← SDK integration
│   │   └── types.ts [23 LOC]
│   │
│   ├── slack/ [Future]
│   │   ├── adapter.ts                          ← Same pattern
│   │   └── types.ts
│   │
│   └── __tests__/
│       ├── unit/
│       │   ├── adapter.test.ts
│       │   ├── inbound-pipeline.test.ts
│       │   ├── telegram/metadata-building.test.ts
│       │   ├── whatsapp/metadata-building.test.ts
│       │   └── whitelist-enforcement.test.ts
│       └── e2e/
│           ├── channels.e2e.test.ts
│           └── media.e2e.test.ts
│
├── config/ [unchanged]
├── agent/ [unchanged]
├── [other services...]
│
└── lib/
    ├── debouncer.ts [NEW — generic]           ← Generic: accumulate + flush
    ├── dedupe.ts [MOVED — generic]            ← Generic: deduplication cache
    ├── exponential-backoff.ts [NEW — generic] ← Generic: retry with backoff
    ├── chunked-send.ts [NEW — generic]        ← Generic: chunking + retry
    ├── [Existing]
    ├── retry.ts
    ├── sleep.ts
    ├── logger.ts
    ├── url-expand.ts
    ├── media.ts
    └── [etc.]
```

**Total:** 7–8 channel files + N provider folders + test suite. Scalable to 10+ adapters with zero changes to core.

---

## 9. Refactor Phases (Simplified)

| Phase | Focus | Files | Time | Risk |
|-------|-------|-------|------|------|
| **0** | Fix bugs + tests | — | 2h | ✅ 1/10 |
| **1** | Move utils to lib/ | +4 in lib, -0 in channels | 2h | ✅ 1/10 |
| **2** | Consolidate into adapter.ts | -2 in channels | 2h | ✅ 2/10 |
| **3** | Extract inbound-pipeline.ts | +1 in channels | 3h | ✅ 2/10 |
| **4** | Inline registry | 0 files | 1h | ✅ 1/10 |
| **TOTAL** | — | **+4 lib, -1 channels** | **10h** | **1/10** |

---

## 10. Migration Checklist

- [ ] Move `services/channels/debounce.ts` → `lib/debouncer.ts`
- [ ] Move `services/channels/dedupe.ts` → `lib/dedupe.ts`
- [ ] Move `services/channels/reconnect.ts` → `lib/exponential-backoff.ts`
- [ ] Create `lib/chunked-send.ts` (extract from `services/channels/delivery.ts`)
- [ ] Merge `BaseChannelAdapter` + `InboundMediaHandler` → `services/channels/adapter.ts`
- [ ] Create `services/channels/inbound-pipeline.ts`
- [ ] Update `services/channels/index.ts` (ChannelService + inline registry)
- [ ] Delete: `base-adapter.ts`, `media-handler.ts`, `channel-target.ts`, `debounce.ts`, `dedupe.ts`, `reconnect.ts`, `delivery.ts`
- [ ] Update imports across all adapters
- [ ] Update tests (expect lib/ imports, not channels/ imports)
- [ ] Verify all tests pass
- [ ] Ship!

---

## Summary: Design Principles

1. ✅ **Generic code lives in `lib/`** — debouncer, dedupe, backoff, chunking are reusable by any service
2. ✅ **Channel-specific code lives in `services/channels/`** — adapters, pipeline, orchestration
3. ✅ **ChannelAdapter is the contract** — simple, complete, one per platform
4. ✅ **Scalable structure** — add Slack/Discord/Mastodon without touching core
5. ✅ **Low regression risk** — mechanical consolidation, behavior unchanged
6. ✅ **Clear responsibility** — "What does my adapter need to do?" → read adapter.ts

**Result: Scalable, maintainable, ready for 10+ channels.**
