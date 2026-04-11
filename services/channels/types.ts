import type { ChannelStatus } from '../../gateway/events.js';

/** Channel adapter interface and types */

export type ChannelType = 'whatsapp' | 'telegram' | (string & {});

export type OnInboundMessageFn = (
  channel: string,
  userId: string,
  content: string,
  metadata?: Record<string, unknown>,
) => Promise<void>;

export interface ChannelAdapter {
  readonly type: ChannelType;
  /** Unique instance id from config.id */
  readonly instanceId: string;
  status: ChannelStatus;

  /** Connect and start receiving messages (init logic included) */
  start(): Promise<void>;

  /** Gracefully disconnect */
  stop(): Promise<void>;

  /** Send a text message to a specific recipient */
  send(recipientId: string, text: string): Promise<void>;

  /** Send a media file to a specific recipient (optional) */
  sendMedia?(recipientId: string, filePath: string, mimeType: string, caption?: string): Promise<void>;

  /** React to a message with an emoji (optional) */
  react?(recipientId: string, messageId: string, emoji: string): Promise<void>;

  startTyping(recipientId: string): void;
  stopTyping(recipientId: string): void;
}
