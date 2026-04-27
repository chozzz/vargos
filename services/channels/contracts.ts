/**
 * Channel adapter contracts — defines what every channel provider must implement.
 * These interfaces form the boundary between core policy and adapter implementations.
 */

import type { ChannelStatus } from '../../gateway/events.js';
import type { ChannelEntry } from '../config/schemas/channels.js';
import type { ChannelType, InboundMediaSource } from './types.js';

/**
 * Required interface all channel adapters must implement.
 * Core calls these methods; adapters call onInboundMessage callback.
 */
export interface ChannelAdapter {
  readonly instanceId: string;
  readonly type: ChannelType;
  readonly status: ChannelStatus;

  start(): Promise<void>;
  stop(): Promise<void>;

  send(sessionKey: string, text: string): Promise<void>;
  startTyping(sessionKey: string, withToolFlag: boolean): void;
  stopTyping(sessionKey: string, final?: boolean): void;
  resumeTyping(sessionKey: string): void;
  extractLatestMessageId(userId: string): string | null | undefined;

  // Optional capabilities — check before calling
  sendMedia?: (sessionKey: string, filePath: string, mimeType: string, caption?: string) => Promise<void>;
  react?: (sessionKey: string, messageId: string, emoji: string) => Promise<void>;
}

/**
 * Adapter dependencies — passed during construction.
 * Unifies callback injection into a single parameter.
 */
export interface AdapterDeps {
  onInbound: OnInboundMessageFn;
  transcribe?: (filePath: string) => Promise<string>;
  describe?: (filePath: string) => Promise<string>;
}

/**
 * Provider pattern: factory for creating channel adapters.
 * Generic over the channel entry type for type-safe config passing.
 */
export interface ChannelProvider<TEntry extends ChannelEntry = ChannelEntry> {
  readonly type: TEntry['type'];
  createAdapter(instanceId: string, config: TEntry, deps: AdapterDeps): Promise<ChannelAdapter>;
}

/**
 * Canonical inbound message shape after normalization.
 * All adapters emit this (via normalizers), core policy handles this.
 */
export interface NormalizedInboundMessage {
  messageId: string;
  fromUserId: string;              // JID or phone, used for whitelist
  fromUser: string;                // Display name
  chatType: 'private' | 'group';
  isMentioned: boolean;
  channelType: string;
  skipAgent: boolean;              // Pre-calculated: should agent act?
  text?: string;
  media?: InboundMediaSource;
}

/**
 * Callback signature for inbound messages.
 * Adapters call this when a message arrives.
 */
export type OnInboundMessageFn = (
  sessionKey: string,
  normalizedMessage: NormalizedInboundMessage,
) => Promise<void>;

/**
 * Normalizer function: adapter-specific message → canonical NormalizedInboundMessage.
 * Each adapter has a normalizer that handles its raw message type.
 */
export type MessageNormalizer<T> = (
  msg: T,
  botId: string,
) => NormalizedInboundMessage | null;
