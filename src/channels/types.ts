/**
 * Channel adapter interface and types
 * Each channel (WhatsApp, Telegram, etc.) implements ChannelAdapter
 */

/** Platform type — 'whatsapp' | 'telegram' | custom string for future adapters */
export type ChannelType = 'whatsapp' | 'telegram' | (string & {});
export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type OnInboundMessageFn = (
  channel: string,
  userId: string,
  content: string,
  metadata?: Record<string, unknown>,
) => Promise<void>;

export interface ChannelAdapter {
  readonly type: ChannelType;
  /** Unique instance id from config.id — used as session key prefix and adapter map key */
  readonly instanceId: string;
  status: ChannelStatus;

  /** One-time initialization (load auth state, etc.) */
  initialize(): Promise<void>;

  /** Connect and start receiving messages */
  start(): Promise<void>;

  /** Gracefully disconnect */
  stop(): Promise<void>;

  /** Send a text message to a specific recipient */
  send(recipientId: string, text: string): Promise<void>;

  /** Send a media file to a specific recipient (optional) */
  sendMedia?(recipientId: string, filePath: string, mimeType: string, caption?: string): Promise<void>;

  /** React to a message with an emoji (optional) */
  react?(recipientId: string, messageId: string, emoji: string): Promise<void>;

  /** Start typing indicator for a recipient */
  startTyping(recipientId: string): void;

  /** Stop typing indicator for a recipient */
  stopTyping(recipientId: string): void;
}
