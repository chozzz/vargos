/**
 * Gateway types and plugin base class.
 * Extracted to avoid circular imports between core.ts and plugin implementations.
 */

import { EventEmitter } from 'node:events';

export type InputType = 'text' | 'voice' | 'image' | 'file' | 'video' | 'location' | 'custom';

export interface InputHandler {
  type: InputType;
  name: string;
  validate(input: unknown): boolean;
  transform(input: unknown): Promise<NormalizedInput>;
}

export interface NormalizedInput {
  type: InputType;
  content: string | Buffer;
  metadata: {
    mimeType?: string;
    filename?: string;
    size?: number;
    encoding?: string;
    [key: string]: unknown;
  };
  source: {
    channel: string;
    userId: string;
    sessionKey: string;
  };
  timestamp: number;
}

export interface GatewayContext {
  sessionKey: string;
  userId: string;
  channel: string;
  permissions: string[];
  metadata: Record<string, unknown>;
}

export interface GatewayResponse {
  success: boolean;
  content: string | Buffer;
  type: 'text' | 'image' | 'file' | 'error';
  metadata?: Record<string, unknown>;
}

export interface StreamingChunk {
  type: 'assistant' | 'tool' | 'compaction' | 'lifecycle';
  content: string;
  isComplete: boolean;
  metadata?: Record<string, unknown>;
}

export interface PreparedInput {
  text: string;
  images?: Array<{ data: string; mimeType: string }>;
  savedPath?: string;
}

/**
 * Base class for input plugins
 */
export abstract class InputPlugin extends EventEmitter {
  abstract readonly type: InputType;
  abstract readonly name: string;

  abstract validate(input: unknown): boolean;
  abstract transform(input: unknown, context: GatewayContext): Promise<NormalizedInput>;
  abstract prepare(input: NormalizedInput): Promise<PreparedInput>;
  abstract formatResponse(response: GatewayResponse, context: GatewayContext): Promise<unknown>;
  abstract streamChunk(chunk: StreamingChunk, context: GatewayContext): void;
}
