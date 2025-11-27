/**
 * Text Input Plugin
 * Handles plain text messages from various channels
 */

import { InputPlugin, type NormalizedInput, type GatewayContext, type GatewayResponse, type StreamingChunk } from '../core.js';

export class TextInputPlugin extends InputPlugin {
  readonly type = 'text' as const;
  readonly name = 'text-plain';

  validate(input: unknown): boolean {
    if (typeof input === 'string') return true;
    if (typeof input !== 'object' || input === null) return false;
    const obj = input as Record<string, unknown>;
    return typeof obj.text === 'string' && obj.text.length > 0;
  }

  async transform(input: unknown, context: GatewayContext): Promise<NormalizedInput> {
    let text: string;
    
    if (typeof input === 'string') {
      text = input;
    } else {
      text = (input as Record<string, string>).text;
    }

    return {
      type: 'text',
      content: text,
      metadata: {
        encoding: 'utf-8',
        length: text.length,
      },
      source: {
        channel: context.channel,
        userId: context.userId,
        sessionKey: context.sessionKey,
      },
      timestamp: Date.now(),
    };
  }

  async formatResponse(response: GatewayResponse, context: GatewayContext): Promise<unknown> {
    return {
      type: 'text',
      content: response.content,
      sessionKey: context.sessionKey,
    };
  }

  streamChunk(chunk: StreamingChunk, context: GatewayContext): void {
    this.emit('stream', {
      type: chunk.type,
      content: chunk.content,
      isComplete: chunk.isComplete,
      sessionKey: context.sessionKey,
    });
  }
}
