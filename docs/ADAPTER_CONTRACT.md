# Channel Adapter Contract

This document defines the abstraction that every channel provider (Telegram, WhatsApp, Slack, Discord, etc.) must implement to integrate with Vargos.

## Overview

A **ChannelAdapter** is a bridge between a messaging platform (Telegram, WhatsApp, Slack) and the Vargos agent execution engine. Its responsibilities are:

1. **Connect & maintain state** — platform-specific auth, reconnection, lifecycle
2. **Inbound message handling** — receive messages, dedupe, batch, extract metadata
3. **Outbound delivery** — send text, media, typing indicators, reactions
4. **Session key management** — map protocol IDs (chat_id, JID, channel_id) to canonical `channel:id` format

---

## Core Interface: `ChannelAdapter`

### Properties

```typescript
export interface ChannelAdapter {
  // Read-only identity
  readonly type: ChannelType;        // 'telegram' | 'whatsapp' | 'slack' | 'discord' | …
  readonly instanceId: string;       // From config.channels[].id (e.g., 'telegram-prod')
  
  status: ChannelStatus;             // 'disconnected' | 'connecting' | 'connected' | 'error'
}
```

### Lifecycle Methods (Required)

```typescript
export interface ChannelAdapter {
  /**
   * Connect to the platform and start receiving messages.
   * Must initialize any protocol-specific state (auth, polling, websocket, etc.).
   * Should emit channel.onConnected event when ready.
   * Should emit channel.onDisconnected event on error.
   * 
   * Implementation pattern:
   *   1. Validate credentials/auth
   *   2. Establish connection (HTTP polling, WebSocket, etc.)
   *   3. Start receiving messages
   *   4. Return when ready (or throw on auth failure)
   * 
   * @throws on auth failure, network error, or invalid credentials
   */
  start(): Promise<void>;

  /**
   * Gracefully disconnect from the platform.
   * Must cancel any timers, close sockets, flush pending messages.
   * Safe to call multiple times.
   * 
   * @throws on cleanup failure (best-effort, errors logged but not fatal)
   */
  stop(): Promise<void>;
}
```

### Outbound Methods (Required)

```typescript
export interface ChannelAdapter {
  /**
   * Send a text message to a recipient.
   * 
   * Session key format: `{instanceId}:{userId}`
   * - Telegram: userId = chat_id (user for private, group ID for group)
   * - WhatsApp: userId = phone (resolved from JID)
   * - Slack: userId = channel_id or user_id
   * - Discord: userId = channel_id or user_id
   * 
   * Text is already cleaned (markdown stripped) by ChannelService.
   * Adapter should respect platform's message size limits.
   * 
   * @param sessionKey  Canonical session key (channel:id)
   * @param text        Plain text message body (may span lines)
   * @throws on network error, invalid recipient, rate limit
   */
  send(sessionKey: string, text: string): Promise<void>;
}
```

### Outbound Methods (Optional — implement if platform supports)

```typescript
export interface ChannelAdapter {
  /**
   * Send a media file to a recipient.
   * 
   * @param sessionKey  Canonical session key (channel:id)
   * @param filePath    Absolute path to file on disk
   * @param mimeType    MIME type (e.g., 'image/jpeg', 'audio/ogg')
   * @param caption     Optional caption/title for the media
   * @throws on file not found, unsupported media type, network error
   */
  sendMedia?(sessionKey: string, filePath: string, mimeType: string, caption?: string): Promise<void>;

  /**
   * React to a message with an emoji or reaction.
   * 
   * @param sessionKey  Canonical session key (channel:id)
   * @param messageId   Platform-specific message ID (stored by adapter)
   * @param emoji       Single emoji character (e.g., '👍', '🤔', '❗')
   * @throws on invalid emoji, message not found, not supported
   */
  react?(sessionKey: string, messageId: string, emoji: string): Promise<void>;
}
```

### Typing Indicator Methods (Required)

These are implemented by `BaseChannelAdapter` (via `TypingStateManager`). Adapters only need to implement the abstract `sendTypingIndicator()`.

```typescript
export interface ChannelAdapter {
  /**
   * Start showing a typing indicator to the user.
   * Automatically pauses after 2 minutes (to prevent long-running indicator).
   * If agent.execute() uses tools, automatically resumes.
   * 
   * Implementation: calls adapter.sendTypingIndicator() every 4 seconds via timer.
   * 
   * @param sessionKey      Canonical session key
   * @param inToolExecution Optional flag: true if agent is executing a tool
   */
  startTyping(sessionKey: string, inToolExecution?: boolean): void;

  /**
   * Resume typing after a tool completes (if it was paused).
   * No-op if not in tool execution mode.
   * 
   * @param sessionKey  Canonical session key
   */
  resumeTyping(sessionKey: string): void;

  /**
   * Stop showing typing indicator.
   * 
   * @param sessionKey  Canonical session key
   * @param final       If true, clear all state (final stop). If false, just stop current cycle.
   */
  stopTyping(sessionKey: string, final?: boolean): void;
}
```

**Abstract method (must implement in BaseChannelAdapter subclass):**

```typescript
protected abstract sendTypingIndicator(sessionKey: string): Promise<void>;
```

Example implementations:
```typescript
// Telegram: sendChatAction with 'typing'
protected async sendTypingIndicator(sessionKey: string): Promise<void> {
  const chatId = this.extractUserId(sessionKey);
  await this.apiCall('sendChatAction', { chat_id: chatId, action: 'typing' });
}

// WhatsApp: sendPresenceUpdate with 'composing'
protected async sendTypingIndicator(sessionKey: string): Promise<void> {
  const jid = this.toJid(this.extractUserId(sessionKey));
  await this.sock?.sendPresenceUpdate('composing', jid);
}

// Slack: no native typing indicator, implement as no-op
protected async sendTypingIndicator(_sessionKey: string): Promise<void> {
  // Slack doesn't support typing indicators, so no-op is acceptable
}
```

### Session Key Methods (Required)

```typescript
export interface ChannelAdapter {
  /**
   * Extract the user/recipient ID from a canonical session key.
   * Reverses the transformation done in buildSessionKey().
   * 
   * Example:
   *   sessionKey = "telegram-1:12345"
   *   returns "12345"
   * 
   * @param sessionKey  Canonical session key
   * @return Platform-specific user/recipient ID
   */
  extractUserId(sessionKey: string): string;

  /**
   * Get the latest message ID for a user (used for reactions).
   * Adapter tracks this internally when processing inbound messages.
   * 
   * Returns undefined if no message has been received from this user.
   * Used by reaction controller to know which message to react to.
   * 
   * @param userId  Platform-specific user ID
   * @return Latest message ID, or undefined
   */
  extractLatestMessageId(userId: string): string | undefined;
}
```

---

## Inbound Message Handling: Internal Adapter Responsibility

The adapter receives a **protocol-specific message** and must:
1. Parse it (extract text, media, metadata)
2. Dedupe (avoid processing the same message twice)
3. Batch/debounce (accumulate rapid messages, flush after delay)
4. Extract metadata (message ID, sender, chat type, mention flag)
5. Emit or call the inbound handler

### Inbound Handler Contract

```typescript
export type OnInboundMessageFn = (
  sessionKey: string,
  content: string,
  metadata?: InboundMessageMetadata,
) => Promise<void>;
```

The adapter calls this function when a message is ready to be processed.

### Metadata Structure (Adapter-Provided)

Each adapter builds this metadata when emitting an inbound message:

```typescript
export interface InboundMessageMetadata {
  // Adapter provides these
  messageId: string;                    // Platform message ID (used for reactions)
  fromUser?: string;                    // Display name or phone (for agent context)
  chatType: 'private' | 'group';        // Is this a direct message or group chat?
  isMentioned?: boolean;                // Was the bot mentioned/replied-to in a group?
  botName?: string;                     // Bot's display name in the platform
  channelType: ChannelType;             // 'telegram' | 'whatsapp' | 'slack' | 'discord'
  skipAgent?: boolean;                  // Pre-calculated: don't execute agent for this
  fromUserId?: string;                  // [CRITICAL] Sender's platform ID (for whitelist checking)
  
  // ChannelService adds these
  cwd?: string;                         // From channel config
  model?: string;                       // From channel config
  instructionsFile?: string;            // From channel config
  
  // Future: media metadata
  media?: { type: 'image' | 'audio'; mimeType: string; path: string };
}
```

### Inbound Flow Template

```typescript
// 1. Protocol message arrives (e.g., TelegramMessage, WhatsAppMessage, SlackMessage)
async handleInbound(msg: ProtocolMessage): Promise<void> {
  // 2. Dedupe: have we seen this message ID before? (within last 2 minutes)
  if (!this.dedupe.add(msg.id)) return;

  // 3. Route based on message type
  if (msg.hasMedia) {
    // Media: flush debouncer first, then handle async
    this.debouncer.flush(msg.senderId);
    this.handleMedia(msg).catch(err => this.log.error('media error', err));
    return;
  }

  // 4. Text message: extract fields
  const metadata: InboundMessageMetadata = {
    messageId: msg.id,
    fromUser: this.resolveUserName(msg.senderId),
    chatType: msg.isGroup ? 'group' : 'private',
    isMentioned: msg.isGroup ? this.isMentioned(msg) : true, // Private: always "mentioned"
    channelType: this.type,
    skipAgent: this.calculateSkipAgent(msg),
    fromUserId: msg.senderId, // [CRITICAL] Raw sender ID for whitelist checking
  };

  // 5. Track latest message ID for reactions
  this.latestMessageId.set(msg.senderId, msg.id);

  // 6. Debounce & batch (delays for 1500ms, accumulates with others from same sender)
  this.debouncer.push(msg.senderId, msg.text, metadata);
}

// 7. After debounce timeout, debouncer calls this
protected async handleBatch(userId: string, messages: string[], metadata?: InboundMessageMetadata): Promise<void> {
  const sessionKey = this.buildSessionKey(userId);
  const text = messages.join('\n');
  await this.onInboundMessage?.(sessionKey, text, metadata);
}
```

### Mention Detection (Protocol-Specific)

Each adapter implements mention detection differently:

```typescript
// Telegram: check if bot username mentioned or message is reply to bot
private isMentioned(msg: TelegramMessage): boolean {
  if (!msg.text || !this.botUser) return false;
  const mentioned = msg.text.toLowerCase().includes(`@${this.botUser.username?.toLowerCase()}`);
  const isReply = msg.reply_to_message?.from?.id === this.botUser.id;
  return mentioned || isReply;
}

// WhatsApp: check if bot JID in mentionedJids or quoted sender is bot
private isMentioned(msg: WhatsAppInboundMessage): boolean {
  if (!msg.isGroup || !this.botJid) return false;
  return msg.mentionedJids?.includes(this.botJid) || msg.quotedSenderJid === this.botJid;
}

// Slack: check if bot user ID in message mentions
private isMentioned(msg: SlackMessage): boolean {
  if (!msg.thread_ts && msg.channel_type !== 'group_dm') return false; // Not mentioned unless DM or threaded
  return msg.text?.includes(`<@${this.botUserId}>`) ?? false;
}
```

### Skip-Agent Determination

For each adapter:

```typescript
private calculateSkipAgent(msg: ProtocolMessage): boolean {
  const chatType = msg.isGroup ? 'group' : 'private';

  // Private chats: always action
  if (chatType === 'private') return false;

  // Group chats: only action if mentioned
  return !this.isMentioned(msg);
}
```

---

## Media Handling (If Supported)

If your adapter supports media, extend `InboundMediaHandler` and implement:

```typescript
export abstract class InboundMediaHandler extends BaseChannelAdapter {
  // Implement this to extract media from your protocol message
  protected abstract resolveMedia(msg: unknown): Promise<InboundMediaSource | null>;
}

export interface InboundMediaSource {
  buffer: Buffer;
  mimeType: string;
  mediaType: 'image' | 'audio' | 'video' | 'document';
  caption?: string;
  duration?: number;
}
```

Example for Slack:

```typescript
protected async resolveMedia(msg: SlackMessage): Promise<InboundMediaSource | null> {
  if (!msg.files?.length) return null;

  const file = msg.files[0];
  const buffer = await this.downloadFile(file.url_private);
  
  return {
    buffer,
    mimeType: file.mimetype || 'application/octet-stream',
    mediaType: this.getMediaType(file.pretty_type),
    caption: msg.text || file.name,
  };
}

private getMediaType(slackType: string): InboundMediaSource['mediaType'] {
  if (slackType.includes('image')) return 'image';
  if (slackType.includes('audio')) return 'audio';
  if (slackType.includes('video')) return 'video';
  return 'document';
}
```

---

## Base Class: `BaseChannelAdapter`

All adapters should extend this class. It provides:

```typescript
export abstract class BaseChannelAdapter implements ChannelAdapter {
  // Provided by base class (no override needed)
  protected readonly dedupe = createDedupeCache();        // TTL-based dedup
  protected readonly debouncer = createMessageDebouncer(); // Per-user batching
  protected readonly typingState = new TypingStateManager(); // Typing lifecycle
  protected readonly log = createLogger(instanceId);      // Logging
  protected latestMessageId = new Map<string, string>();  // For reactions

  // Abstract methods — must implement
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(sessionKey: string, text: string): Promise<void>;
  protected abstract sendTypingIndicator(sessionKey: string): Promise<void>;

  // Provided implementations
  startTyping(sessionKey: string, inToolExecution = false): void { … }
  resumeTyping(sessionKey: string): void { … }
  stopTyping(sessionKey: string, final = true): void { … }
  extractUserId(sessionKey: string): string { … }
  extractLatestMessageId(userId: string): string | undefined { … }

  // Helper for subclasses
  protected buildSessionKey(userId: string): string {
    return `${this.instanceId}:${userId}`;
  }

  protected async handleBatch(id: string, messages: string[], metadata?: InboundMessageMetadata): Promise<void> {
    const sessionKey = this.buildSessionKey(id);
    await this.onInboundMessage?.(sessionKey, messages.join('\n'), metadata);
  }

  protected cleanupTimers(): void {
    this.debouncer.flushAll();
    this.typingState.cleanup();
  }
}
```

---

## Real-World Example: Adding Slack

### Step 1: Implement ChannelAdapter

```typescript
import type { OnInboundMessageFn, InboundMediaSource } from '../types.js';
import { InboundMediaHandler } from '../media-handler.js';
import { Reconnector } from '../reconnect.js';

export class SlackAdapter extends InboundMediaHandler {
  readonly type = 'slack' as const;

  private client: SlackClient | null = null;
  private botUserId = '';
  private reconnector = new Reconnector();

  constructor(
    instanceId: string,
    private botToken: string,
    onInboundMessage?: OnInboundMessageFn,
  ) {
    super(instanceId, 'slack', onInboundMessage);
  }

  async start(): Promise<void> {
    this.status = 'connecting';
    try {
      this.client = new SlackClient({ token: this.botToken });
      const auth = await this.client.auth.test();
      this.botUserId = auth.user_id;
      this.status = 'connected';

      // Start listening to events
      await this.client.socket.connect(this.handleSlackEvent.bind(this));
      this.reconnector.reset();
    } catch (err) {
      this.status = 'error';
      this.log.error('failed to start', { error: toMessage(err) });
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.cleanupTimers();
    await this.client?.socket.disconnect();
    this.client = null;
    this.status = 'disconnected';
  }

  async send(sessionKey: string, text: string): Promise<void> {
    if (!this.client) throw new Error('Slack not connected');
    const channelId = this.extractUserId(sessionKey);
    await this.client.chat.postMessage({ channel: channelId, text });
  }

  async sendMedia(sessionKey: string, filePath: string, mimeType: string, _caption?: string): Promise<void> {
    if (!this.client) throw new Error('Slack not connected');
    const channelId = this.extractUserId(sessionKey);
    const buffer = readFileSync(filePath);
    const fileName = path.basename(filePath);

    await this.client.files.uploadV2({
      channel_id: channelId,
      file: buffer,
      filename: fileName,
    });
  }

  protected async sendTypingIndicator(sessionKey: string): Promise<void> {
    // Slack doesn't have a native typing indicator, so no-op
    // (could use "channel is typing" in pinned message, but that's overkill)
  }

  async react(sessionKey: string, messageId: string, emoji: string): Promise<void> {
    if (!this.client) throw new Error('Slack not connected');
    const channelId = this.extractUserId(sessionKey);
    const [ts, _] = messageId.split(':');
    await this.client.reactions.add({
      channel: channelId,
      timestamp: ts,
      emoji: emoji.replace(/:/g, ''), // Slack uses ':emoji:' format
    });
  }

  private async handleSlackEvent(event: SlackEvent): Promise<void> {
    if (event.type !== 'message') return;
    const msg = event as SlackMessage;

    if (msg.bot_id || msg.user === this.botUserId) return; // Ignore own messages

    if (!msg.text && !msg.files?.length) return;

    // Dedupe
    const messageId = `${msg.ts}:${msg.channel}`;
    if (!this.dedupe.add(messageId)) return;

    // Handle media
    if (msg.files?.length) {
      this.debouncer.flush(msg.user);
      this.handleMedia(msg).catch(err => this.log.error('media error', err));
      return;
    }

    // Handle text
    const metadata: InboundMessageMetadata = {
      messageId,
      fromUser: msg.user_name || msg.user,
      chatType: msg.channel_type === 'im' ? 'private' : 'group',
      isMentioned: msg.text.includes(`<@${this.botUserId}>`),
      channelType: 'slack',
      skipAgent: this.calculateSkipAgent(msg),
      fromUserId: msg.user,
    };

    this.latestMessageId.set(msg.user, messageId);
    this.debouncer.push(msg.user, msg.text, metadata);
  }

  private calculateSkipAgent(msg: SlackMessage): boolean {
    const isPrivate = msg.channel_type === 'im';
    if (isPrivate) return false;

    // Group: only action if mentioned or threaded reply to bot
    return !this.isMentioned(msg);
  }

  private isMentioned(msg: SlackMessage): boolean {
    if (msg.channel_type === 'im') return true;
    if (msg.thread_ts && msg.parent_user_id === this.botUserId) return true;
    return msg.text.includes(`<@${this.botUserId}>`);
  }

  protected async resolveMedia(msg: SlackMessage): Promise<InboundMediaSource | null> {
    if (!msg.files?.length) return null;

    const file = msg.files[0];
    const buffer = await this.downloadFile(file.url_private);

    return {
      buffer,
      mimeType: file.mimetype || 'application/octet-stream',
      mediaType: this.getMediaType(file.pretty_type),
      caption: msg.text || file.name,
    };
  }

  private async downloadFile(url: string): Promise<Buffer> {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.botToken}` },
    });
    if (!res.ok) throw new Error(`Failed to download file: ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  }

  private getMediaType(slackType: string): InboundMediaSource['mediaType'] {
    if (slackType.includes('image')) return 'image';
    if (slackType.includes('audio')) return 'audio';
    if (slackType.includes('video')) return 'video';
    return 'document';
  }
}
```

### Step 2: Register in Provider Registry

```typescript
// In ChannelService.__init__ or in providers/slack.ts:
registry.register('slack', (entry: ChannelEntry) => {
  const cfg = entry as SlackChannel;
  const adapter = new SlackAdapter(entry.id, cfg.botToken, this.onInboundMessage.bind(this));
  adapter.setTranscribeFn(transcribeFn);
  adapter.setDescribeFn(describeFn);
  return adapter;
});
```

### Step 3: Add Config Schema

```typescript
// services/config/schemas/channels.ts
export const SlackChannelSchema = ChannelBaseSchema.extend({
  type: z.literal('slack'),
  botToken: z.string(),
});

export const ChannelEntrySchema = z.discriminatedUnion('type', [
  TelegramChannelSchema,
  WhatsAppChannelSchema,
  SlackChannelSchema,  // NEW
]);
```

---

## Critical Invariants (Do Not Break)

1. **Session Key Format**
   ```
   {instanceId}:{userId}
   
   Examples:
   - telegram-prod:12345
   - whatsapp-1:614..
   - slack-workspace:C123456
   ```
   The `userId` part must unambiguously resolve to the **reply destination** (where to send responses).

2. **Message ID Tracking**
   - Adapter must call `this.latestMessageId.set(userId, messageId)` when processing inbound messages
   - Used by reaction controller to know which message to react to
   - Must be the **exact ID the platform gave you**, not transformed

3. **skipAgent Semantics**
   - `false` → execute agent, send response
   - `true` → append to history only, don't execute (logged as `inbound (skipAgent)`)
   - Private chats should **always** have `skipAgent = false`
   - Group chats should have `skipAgent = false` only if mentioned

4. **Metadata.fromUserId**
   - Must be the **raw sender ID**, not the destination
   - Used for whitelist checking in ChannelService
   - If omitted, whitelist check silently fails (BUG)

5. **Error Handling**
   - `start()` should throw on auth failure (will be caught and logged)
   - `stop()` should not throw (best-effort cleanup)
   - `send()` should throw on network error (will be retried by ChannelService)
   - `sendTypingIndicator()` failures are logged but non-critical

6. **Typing Indicator**
   - `sendTypingIndicator()` is called every 4 seconds
   - May fail (non-critical) — typing manager counts failures
   - After 3 failures, typing is stopped
   - Automatically pauses after 2 minutes (user has waited long enough)
   - Automatically resumes if agent enters tool execution phase

7. **Deduplication**
   - Adapter dedupe cache: 2 minutes, 10k max entries
   - **Message ID must be unique per platform** (don't hash, use native ID)
   - If you dedupe wrong, messages get silently dropped

---

## Testing Your Adapter

Add unit tests for:

```typescript
describe('SlackAdapter', () => {
  describe('Inbound message handling', () => {
    it('dedupes identical message IDs', () => { … });
    it('batches rapid messages from same user', () => { … });
    it('extracts metadata correctly', () => { … });
    it('detects mentions in group chats', () => { … });
    it('sets skipAgent=false for private chats', () => { … });
    it('sets skipAgent=true for group chats without mention', () => { … });
  });

  describe('Outbound delivery', () => {
    it('sends text message via API', () => { … });
    it('sends media file via API', () => { … });
    it('sends reactions with correct emoji format', () => { … });
  });

  describe('Typing indicators', () => {
    it('sends typing indicator every 4 seconds', () => { … });
    it('stops after 2 minutes', () => { … });
    it('resumes on tool execution', () => { … });
  });

  describe('Media handling', () => {
    it('downloads and resolves media files', () => { … });
    it('extracts caption and duration', () => { … });
    it('handles missing media gracefully', () => { … });
  });

  describe('Session key handling', () => {
    it('builds session key as instanceId:userId', () => { … });
    it('extracts userId from session key', () => { … });
  });
});
```

---

## Summary: Adapter Checklist

When implementing a new adapter, ensure:

- [ ] **Extend `BaseChannelAdapter`** (or `InboundMediaHandler` if media support needed)
- [ ] **Implement required methods:**
  - `start()` — connect and start receiving messages
  - `stop()` — graceful disconnect
  - `send()` — send text to user
  - `sendTypingIndicator()` — show typing indicator (can be no-op)
  - `extractUserId()` — parse session key (usually just split on `:`)
  - `extractLatestMessageId()` — return stored message ID for reactions
- [ ] **Implement optional methods (if platform supports):**
  - `sendMedia()` — send files
  - `react()` — send reactions
- [ ] **Handle inbound messages:**
  - Dedupe by message ID (platform-native, not hashed)
  - Batch rapid messages (use `this.debouncer.push()`)
  - Extract metadata (messageId, fromUser, chatType, isMentioned, skipAgent, **fromUserId**)
  - Call `this.onInboundMessage(sessionKey, text, metadata)`
- [ ] **Handle media (if supported):**
  - Extend `InboundMediaHandler`
  - Implement `resolveMedia()` to extract buffer + mimeType
  - Pipeline handles transcription + description
- [ ] **Session key format:**
  - Must be `instanceId:userId` where `userId` is reply destination
  - Consistent with config (e.g., both use phone number, or both use internal ID)
- [ ] **Error handling:**
  - `start()` throws on auth failure
  - Network errors in `send()` are retried
  - `sendTypingIndicator()` failures are logged but non-fatal
- [ ] **Tests:**
  - Dedupe logic
  - Metadata construction
  - Skip-agent determination
  - Mention detection
  - Session key round-trips
  - Media handling (if supported)

---

## Example Adapter Skeleton

```typescript
import type { OnInboundMessageFn } from '../types.js';
import { InboundMediaHandler } from '../media-handler.js';

export class MyPlatformAdapter extends InboundMediaHandler {
  readonly type = 'myplatform' as const;

  constructor(
    instanceId: string,
    private config: MyPlatformConfig,
    onInboundMessage?: OnInboundMessageFn,
  ) {
    super(instanceId, 'myplatform', onInboundMessage);
  }

  async start(): Promise<void> {
    this.status = 'connecting';
    // TODO: Connect to platform
    // TODO: Start receiving messages
    // TODO: Set this.status = 'connected'
  }

  async stop(): Promise<void> {
    // TODO: Disconnect gracefully
    this.cleanupTimers();
    this.status = 'disconnected';
  }

  async send(sessionKey: string, text: string): Promise<void> {
    const userId = this.extractUserId(sessionKey);
    // TODO: Send via platform API
  }

  async sendMedia(sessionKey: string, filePath: string, mimeType: string, caption?: string): Promise<void> {
    const userId = this.extractUserId(sessionKey);
    // TODO: Upload and send media
  }

  async react(sessionKey: string, messageId: string, emoji: string): Promise<void> {
    const userId = this.extractUserId(sessionKey);
    // TODO: Send reaction
  }

  protected async sendTypingIndicator(sessionKey: string): Promise<void> {
    const userId = this.extractUserId(sessionKey);
    // TODO: Send typing indicator (or no-op if not supported)
  }

  protected async resolveMedia(msg: unknown): Promise<InboundMediaSource | null> {
    // TODO: Extract media from protocol message
    return null;
  }

  private async handleInbound(msg: MyPlatformMessage): Promise<void> {
    // TODO: Implement inbound flow
    // 1. Dedupe check
    // 2. Media vs text routing
    // 3. Metadata extraction
    // 4. Debounce.push() or direct handleMedia()
  }
}
```

This gives you the complete contract. Any adapter following this interface will work seamlessly with Vargos.
