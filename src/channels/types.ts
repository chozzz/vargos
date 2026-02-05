/**
 * Channel adapter interface and types
 * Each channel (WhatsApp, Telegram, etc.) implements ChannelAdapter
 */

export type ChannelType = 'whatsapp' | 'telegram';
export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ChannelConfig {
  type: ChannelType;
  enabled: boolean;
  /** Telegram bot token */
  botToken?: string;
  /** Whitelist of sender IDs (phone numbers / chat IDs). Empty = accept all. */
  allowFrom?: string[];
}

export interface ChannelAdapter {
  readonly type: ChannelType;
  status: ChannelStatus;

  /** One-time initialization (load auth state, etc.) */
  initialize(): Promise<void>;

  /** Connect and start receiving messages */
  start(): Promise<void>;

  /** Gracefully disconnect */
  stop(): Promise<void>;

  /** Send a text message to a specific recipient */
  send(recipientId: string, text: string): Promise<void>;
}
