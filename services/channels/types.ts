import type { ChannelStatus } from '../../gateway/events.js';

/** Channel adapter interface and types */

export type ChannelType = 'whatsapp' | 'telegram' | (string & {});

export type OnInboundMessageFn = (
  sessionKey: string,
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

  /** Send a text message (sessionKey encodes recipient) */
  send(sessionKey: string, text: string): Promise<void>;

  /** Send a media file (optional) */
  sendMedia?(sessionKey: string, filePath: string, mimeType: string, caption?: string): Promise<void>;

  /** React to a message with an emoji (optional) */
  react?(sessionKey: string, messageId: string, emoji: string): Promise<void>;

  startTyping(sessionKey: string, inToolExecution?: boolean): void;
  resumeTyping(sessionKey: string): void;
  stopTyping(sessionKey: string, final?: boolean): void;

  /** Extract userId from sessionKey for adapter-specific use. */
  extractUserId(sessionKey: string): string;
}
