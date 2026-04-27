import type { OnInboundMessageFn, NormalizedInboundMessage } from './contracts.js';

/** Channel adapter interface and types */

export type ChannelType = 'whatsapp' | 'telegram' | (string & {});

export interface InboundMediaSource {
  buffer: Buffer;
  mimeType: string;
  mediaType: 'image' | 'audio' | 'video' | 'document';
  caption?: string;
  duration?: number;
}

export interface ExtractedMedia {
  filePath: string;
  mimeType: string;
}

// Re-export from contracts for backward compatibility
export type { OnInboundMessageFn, NormalizedInboundMessage };
